import { Canvas } from "@react-three/fiber";
import { Preload, View } from "@react-three/drei";
import { Suspense } from "react";

/**
 * The GlobalCanvas sits at a fixed position over the entire screen.
 * It uses `pointer-events: none` by default so it doesn't block interactions,
 * except inside specific `<View>` portals where `pointer-events: auto` is used.
 */
export function GlobalCanvas() {
  return (
    <Canvas
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 0,
      }}
      eventSource={document.getElementById("root") || undefined}
      eventPrefix="client"
      camera={{ position: [0, 0, 5], fov: 45 }}
    >
      <Suspense fallback={null}>
        {/*
          View.Port renders all <View /> components in the DOM tree
          into this single WebGL context, allowing seamless 3D embedding.
        */}
        <View.Port />
        <Preload all />
      </Suspense>
    </Canvas>
  );
}
