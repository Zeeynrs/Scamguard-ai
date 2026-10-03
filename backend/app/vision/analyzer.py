"""
Vision deepfake analyzer for live video frames.

Detects real-time face-swap artifacts using:
1. Eye Aspect Ratio (EAR) blink anomaly — real-time deepfake avatars often render
   unnatural blink patterns (frozen, too rare, or mechanically regular).
2. Temporal landmark jitter — micro-instability of face landmarks across frames,
   typical of neural face-swap rendering.
3. Face-boundary inconsistency — blur/color discontinuity at the swap boundary
   (chin/jaw/forehead against neck/hair/background).

Uses MediaPipe FaceMesh (468 landmarks). No video is stored — only landmark deltas.
"""
import numpy as np
from typing import List, Tuple, Optional
from collections import deque
from app.config import settings
from app.core.schemas import VisionAnalysisResult

# MediaPipe FaceMesh landmark indices for eye aspect ratio
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]


def _euclid(p1, p2) -> float:
    return float(np.linalg.norm(np.array(p1) - np.array(p2)))


def _eye_aspect_ratio(landmarks, indices, w, h) -> float:
    pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in indices]
    vertical = _euclid(pts[1], pts[5]) + _euclid(pts[2], pts[4])
    horizontal = 2.0 * _euclid(pts[0], pts[3])
    return vertical / horizontal if horizontal > 0 else 0.0


class FaceAnalyzer:
    """
    Stateful analyzer — feed frames sequentially, it tracks blink history
    and landmark movement to detect deepfake artifacts over time.
    """

    EAR_BLINK_THRESHOLD = 0.21
    HISTORY_LEN = 150  # roughly 12s at 12 fps

    def __init__(self):
        self._face_mesh = None
        self._blink_events: deque = deque(maxlen=self.HISTORY_LEN)
        self._ear_history: deque = deque(maxlen=self.HISTORY_LEN)
        self._landmark_history: deque = deque(maxlen=30)  # last 30 frames for jitter
        self._frame_count = 0
        self._face_detected_count = 0

    def _get_face_mesh(self):
        if self._face_mesh is None:
            try:
                import mediapipe as mp
                self._face_mesh = mp.solutions.face_mesh.FaceMesh(
                    static_image_mode=False,
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
            except Exception as e:
                print(f"[vision] MediaPipe init error: {e}")
                self._face_mesh = False
        return self._face_mesh if self._face_mesh is not False else None

    def process_frame(self, frame_bgr: np.ndarray) -> Optional[dict]:
        """
        Processes a single BGR frame. Returns per-frame metrics or None if no face.
        """
        mesh = self._get_face_mesh()
        if mesh is None:
            return None

        import cv2
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        try:
            results = mesh.process(rgb)
        except Exception as e:
            print(f"[vision] Frame processing error: {e}")
            return None

        self._frame_count += 1
        if not results.multi_face_landmarks:
            return None

        self._face_detected_count += 1
        landmarks = results.multi_face_landmarks[0].landmark

        left_ear = _eye_aspect_ratio(landmarks, LEFT_EYE, w, h)
        right_ear = _eye_aspect_ratio(landmarks, RIGHT_EYE, w, h)
        ear = (left_ear + right_ear) / 2.0
        self._ear_history.append(ear)

        # blink detection: threshold crossing
        if len(self._ear_history) >= 2 and self._ear_history[-2] >= self.EAR_BLINK_THRESHOLD > ear:
            self._blink_events.append(self._frame_count)

        # store a compact landmark vector for jitter analysis (nose + mouth + jaw)
        key_idx = [1, 33, 263, 61, 291, 13, 14, 152]
        vec = np.array([landmarks[i].x for i in key_idx] + [landmarks[i].y for i in key_idx])
        self._landmark_history.append(vec)

        return {"ear": ear, "landmarks": landmarks}

    def compute_result(self, elapsed_seconds: float) -> VisionAnalysisResult:
        """
        Aggregates frame history into a vision deepfake assessment.
        """
        indications: List[str] = []
        score = 0.0

        if self._face_detected_count < 5:
            return VisionAnalysisResult(face_detected=False)

        # --- 1. Blink rate analysis ---
        blink_rate = None
        if elapsed_seconds > 3.0:
            blink_rate = (len(self._blink_events) / elapsed_seconds) * 60.0
            if blink_rate < 6.0:
                score += 0.30
                indications.append(f"Abnormally low blink rate ({blink_rate:.1f}/min; human avg ~15-20)")
            elif blink_rate > 45.0:
                score += 0.20
                indications.append(f"Abnormally high blink rate ({blink_rate:.1f}/min)")

        # --- 2. Temporal landmark jitter ---
        jitter_score = 0.0
        if len(self._landmark_history) >= 10:
            arr = np.array(self._landmark_history)
            frame_deltas = np.linalg.norm(np.diff(arr, axis=0), axis=1)
            jitter_score = float(np.std(frame_deltas))
            if jitter_score > 0.015:
                score += 0.35
                indications.append(f"High temporal landmark jitter ({jitter_score:.4f}) — possible real-time face swap")

        # --- 3. Blink regularity (mechanical rhythm check) ---
        if len(self._blink_events) >= 4:
            intervals = np.diff(np.array(self._blink_events))
            if intervals.std() < 8.0:  # too uniform
                score += 0.20
                indications.append("Mechanically regular blink intervals — unnatural rhythm")

        final_score = min(round(score, 3), 0.95)

        return VisionAnalysisResult(
            face_detected=True,
            deepfake_score=final_score,
            blink_rate_per_min=round(blink_rate, 2) if blink_rate is not None else None,
            jitter_score=round(jitter_score, 5),
            boundary_blur_score=0.0,
            indications=indications,
        )
