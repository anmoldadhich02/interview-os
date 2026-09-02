import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export interface ProctoringState {
  isCentered: boolean;
  isLookingAway: boolean;
  faceDetected: boolean;
  multipleFaces: boolean;
  eyeGazeOffScreen: boolean;
  gazeDirection: string | null;
}

let faceLandmarker: FaceLandmarker | null = null;

export async function initFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;

  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "CPU",
    },
    outputFaceBlendshapes: false,
    runningMode: "VIDEO",
    numFaces: 2,
  });

  return faceLandmarker;
}

export function evaluateProctoring(
  videoElement: HTMLVideoElement,
  timestamp: number
): ProctoringState {
  const defaultState: ProctoringState = {
    isCentered: false,
    isLookingAway: false,
    faceDetected: false,
    multipleFaces: false,
    eyeGazeOffScreen: false,
    gazeDirection: null,
  };

  if (!faceLandmarker || videoElement.readyState < 2) {
    return defaultState;
  }

  const results = faceLandmarker.detectForVideo(videoElement, timestamp);

  if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
    return defaultState;
  }

  // Multiple faces detected
  if (results.faceLandmarks.length > 1) {
    return { ...defaultState, faceDetected: true, multipleFaces: true };
  }

  const landmarks = results.faceLandmarks[0];

  // Use nose tip as the anchor point to check if face is centered
  const nose = landmarks[1];

  // Simple centering check — nose should be roughly in the middle third of the frame
  const isCenteredX = nose.x > 0.25 && nose.x < 0.75;
  const isCenteredY = nose.y > 0.2 && nose.y < 0.8;
  const isCentered = isCenteredX && isCenteredY;

  // Basic head-turn check using left/right eye distance asymmetry to nose
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const leftDist = Math.hypot(nose.x - leftEye.x, nose.y - leftEye.y);
  const rightDist = Math.hypot(nose.x - rightEye.x, nose.y - rightEye.y);
  const ratio = Math.max(leftDist, rightDist) / Math.min(leftDist, rightDist);
  // Only flag as looking away if head is turned very significantly (ratio > 3)
  const isLookingAway = ratio > 3.0;

  return {
    isCentered,
    isLookingAway,
    faceDetected: true,
    multipleFaces: false,
    eyeGazeOffScreen: false,
    gazeDirection: null,
  };
}
