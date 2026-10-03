#!/usr/bin/env python3
"""
Vision pipeline standalone test — MediaPipe FaceMesh blink/jitter detection.
Tests with a static image (requires face photo) or synthetic test data.
"""
import sys
sys.path.insert(0, '.')

import numpy as np
from app.vision.analyzer import FaceAnalyzer

def test_synthetic_frames():
    """Generate synthetic test frames (random noise) to verify pipeline loads."""
    print("=== Synthetic Frame Test ===")
    analyzer = FaceAnalyzer()
    
    # Generate 30 random RGB frames (simulating no-face scenario)
    for i in range(30):
        fake_frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        result = analyzer.process_frame(fake_frame)
        if result:
            print(f"Frame {i}: face detected (unexpected in random noise)")
    
    vision_result = analyzer.compute_result(elapsed_seconds=2.0)
    print(f"Face detected: {vision_result.face_detected}")
    print(f"Deepfake score: {vision_result.deepfake_score}")
    print(f"Indications: {vision_result.indications}")
    print("✓ Vision pipeline loads without error\n")


def test_with_image(image_path: str):
    """Load an image file and run face detection."""
    import cv2
    print(f"=== Image Test: {image_path} ===")
    
    img = cv2.imread(image_path)
    if img is None:
        print(f"Could not load image: {image_path}")
        return
    
    analyzer = FaceAnalyzer()
    result = analyzer.process_frame(img)
    
    if result:
        print(f"✓ Face detected, EAR: {result['ear']:.3f}")
    else:
        print("✗ No face detected")
    
    vision_result = analyzer.compute_result(elapsed_seconds=1.0)
    print(f"Deepfake score: {vision_result.deepfake_score}")
    print(f"Indications: {vision_result.indications}\n")


if __name__ == "__main__":
    test_synthetic_frames()
    
    # If user provides an image path, test it
    if len(sys.argv) > 1:
        test_with_image(sys.argv[1])
    else:
        print("Usage: python test_vision.py [path/to/face_image.jpg]")
        print("(optional — synthetic test already passed)")
