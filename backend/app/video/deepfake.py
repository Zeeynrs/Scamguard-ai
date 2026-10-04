"""
Video deepfake detection via blink rate and facial landmark jitter.
"""
import time
from collections import deque
from typing import Optional, Tuple
import numpy as np
import cv2

try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False


class VideoDeepfakeDetector:
    """
    Detects video deepfakes using:
    1. Blink rate analysis (deepfakes often have unnaturally low blink rates)
    2. Facial landmark jitter (synthetic faces show unnatural micro-movements)
    """
    
    # Eye landmark indices for MediaPipe Face Mesh (468 landmarks)
    # Left eye: 33, 160, 158, 133, 153, 144
    # Right eye: 362, 385, 387, 263, 373, 380
    LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
    RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
    
    # Thresholds
    EAR_BLINK_THRESHOLD = 0.21  # Eye aspect ratio below this = blink
    MIN_BLINK_FRAMES = 2        # Minimum consecutive frames for valid blink
    NORMAL_BLINK_RATE_MIN = 10  # blinks per minute (lower = suspicious)
    JITTER_THRESHOLD = 15.0     # pixel stddev across frames (higher = suspicious)
    
    def __init__(self, window_seconds: float = 10.0):
        """
        Args:
            window_seconds: Rolling window for blink rate calculation
        """
        self.window_seconds = window_seconds
        self.blink_timestamps = deque(maxlen=100)  # Last 100 blinks
        self.ear_history = deque(maxlen=30)        # Last 30 EAR values (1s @ 30fps)
        self.landmark_history = deque(maxlen=10)   # Last 10 frames of landmarks for jitter
        
        self.blink_counter = 0
        self.frame_counter = 0
        self.start_time = time.time()
        self.is_blinking = False
        self.blink_frame_count = 0
        
        if MEDIAPIPE_AVAILABLE:
            self.mp_face_mesh = mp.solutions.face_mesh
            self.face_mesh = self.mp_face_mesh.FaceMesh(
                max_num_faces=1,
                refine_landmarks=False,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )
        else:
            self.face_mesh = None
    
    def _calculate_ear(self, eye_landmarks: np.ndarray) -> float:
        """
        Calculate Eye Aspect Ratio (EAR).
        
        EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
        where p1..p6 are eye landmarks in order.
        
        Args:
            eye_landmarks: Nx2 array of eye corner coordinates
        
        Returns:
            Eye aspect ratio (lower = more closed)
        """
        if len(eye_landmarks) < 6:
            return 0.25  # Default neutral value
        
        # Vertical distances
        vertical_1 = np.linalg.norm(eye_landmarks[1] - eye_landmarks[5])
        vertical_2 = np.linalg.norm(eye_landmarks[2] - eye_landmarks[4])
        
        # Horizontal distance
        horizontal = np.linalg.norm(eye_landmarks[0] - eye_landmarks[3])
        
        if horizontal < 1e-6:
            return 0.25
        
        ear = (vertical_1 + vertical_2) / (2.0 * horizontal)
        return ear
    
    def _extract_eye_landmarks(self, face_landmarks, image_shape: Tuple[int, int], 
                               eye_indices: list) -> np.ndarray:
        """Extract pixel coordinates for eye landmarks."""
        h, w = image_shape[:2]
        coords = []
        for idx in eye_indices:
            landmark = face_landmarks.landmark[idx]
            x = int(landmark.x * w)
            y = int(landmark.y * h)
            coords.append([x, y])
        return np.array(coords, dtype=np.float32)
    
    def _calculate_landmark_jitter(self) -> float:
        """
        Calculate facial landmark jitter (stability metric).
        
        Returns:
            Average pixel stddev across landmarks (higher = more jitter)
        """
        if len(self.landmark_history) < 3:
            return 0.0
        
        # Stack landmarks: (num_frames, num_landmarks, 2)
        landmarks_array = np.array(list(self.landmark_history))
        
        # Calculate stddev across time for each landmark coordinate
        stddev_per_landmark = np.std(landmarks_array, axis=0)  # (num_landmarks, 2)
        
        # Average across all landmarks and x/y
        mean_jitter = np.mean(stddev_per_landmark)
        return float(mean_jitter)
    
    def analyze_frame(self, frame_bgr: np.ndarray) -> dict:
        """
        Analyze single video frame for deepfake indicators.
        
        Args:
            frame_bgr: OpenCV BGR image (numpy array)
        
        Returns:
            {
                "face_detected": bool,
                "deepfake_score": float (0.0-1.0),
                "blink_rate": float (blinks per minute),
                "jitter_score": float (pixel stddev),
                "indications": List[str]
            }
        """
        self.frame_counter += 1
        
        if not MEDIAPIPE_AVAILABLE or self.face_mesh is None:
            return {
                "face_detected": False,
                "deepfake_score": 0.0,
                "blink_rate": 0.0,
                "jitter_score": 0.0,
                "indications": ["MediaPipe not available"]
            }
        
        # Convert BGR to RGB for MediaPipe
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(frame_rgb)
        
        if not results.multi_face_landmarks:
            return {
                "face_detected": False,
                "deepfake_score": 0.0,
                "blink_rate": 0.0,
                "jitter_score": 0.0,
                "indications": ["No face detected"]
            }
        
        face_landmarks = results.multi_face_landmarks[0]
        h, w = frame_bgr.shape[:2]
        
        # Extract eye landmarks
        left_eye = self._extract_eye_landmarks(face_landmarks, (h, w), self.LEFT_EYE_INDICES)
        right_eye = self._extract_eye_landmarks(face_landmarks, (h, w), self.RIGHT_EYE_INDICES)
        
        # Calculate EAR
        left_ear = self._calculate_ear(left_eye)
        right_ear = self._calculate_ear(right_eye)
        avg_ear = (left_ear + right_ear) / 2.0
        self.ear_history.append(avg_ear)
        
        # Blink detection
        if avg_ear < self.EAR_BLINK_THRESHOLD:
            self.blink_frame_count += 1
            if not self.is_blinking and self.blink_frame_count >= self.MIN_BLINK_FRAMES:
                # Valid blink detected
                self.is_blinking = True
                self.blink_counter += 1
                self.blink_timestamps.append(time.time())
        else:
            if self.is_blinking:
                self.is_blinking = False
            self.blink_frame_count = 0
        
        # Calculate blink rate (blinks per minute over rolling window)
        current_time = time.time()
        recent_blinks = [t for t in self.blink_timestamps 
                        if current_time - t <= self.window_seconds]
        self.blink_timestamps = deque(recent_blinks, maxlen=100)
        
        elapsed = current_time - self.start_time
        if elapsed < self.window_seconds:
            # Not enough data yet
            blink_rate = 0.0
        else:
            blink_rate = (len(recent_blinks) / self.window_seconds) * 60.0
        
        # Store landmarks for jitter calculation
        # Flatten all landmarks to 1D array
        all_landmarks = []
        for idx in range(0, 468, 10):  # Sample every 10th landmark (47 landmarks)
            lm = face_landmarks.landmark[idx]
            all_landmarks.extend([lm.x * w, lm.y * h])
        self.landmark_history.append(all_landmarks)
        
        jitter_score = self._calculate_landmark_jitter()
        
        # Scoring
        indications = []
        deepfake_score = 0.0
        
        # Low blink rate indicator
        if elapsed >= self.window_seconds and blink_rate < self.NORMAL_BLINK_RATE_MIN:
            blink_penalty = (self.NORMAL_BLINK_RATE_MIN - blink_rate) / self.NORMAL_BLINK_RATE_MIN
            deepfake_score += 0.5 * blink_penalty
            indications.append(f"Low blink rate: {blink_rate:.1f}/min (expected >10/min)")
        
        # High jitter indicator
        if jitter_score > self.JITTER_THRESHOLD:
            jitter_penalty = min(1.0, (jitter_score - self.JITTER_THRESHOLD) / self.JITTER_THRESHOLD)
            deepfake_score += 0.4 * jitter_penalty
            indications.append(f"Facial jitter detected: {jitter_score:.1f}px stddev")
        
        # No blinks at all after sufficient time
        if elapsed > 15.0 and self.blink_counter == 0:
            deepfake_score = max(deepfake_score, 0.7)
            indications.append("No blinks detected (highly suspicious)")
        
        deepfake_score = min(1.0, deepfake_score)
        
        return {
            "face_detected": True,
            "deepfake_score": round(deepfake_score, 3),
            "blink_rate": round(blink_rate, 1),
            "jitter_score": round(jitter_score, 2),
            "indications": indications
        }
    
    def reset(self):
        """Reset all state (for new session)."""
        self.blink_timestamps.clear()
        self.ear_history.clear()
        self.landmark_history.clear()
        self.blink_counter = 0
        self.frame_counter = 0
        self.start_time = time.time()
        self.is_blinking = False
        self.blink_frame_count = 0
