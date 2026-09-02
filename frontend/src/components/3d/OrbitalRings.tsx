import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";

export function OrbitalRings() {
  const group = useRef<THREE.Group>(null);
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const ring3 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (group.current) {
      group.current.rotation.y = t * 0.15;
      group.current.rotation.x = Math.sin(t * 0.2) * 0.2;
    }
    if (ring1.current) {
      ring1.current.rotation.x = t * 0.4;
      ring1.current.rotation.y = t * 0.2;
    }
    if (ring2.current) {
      ring2.current.rotation.x = -t * 0.3;
      ring2.current.rotation.z = t * 0.1;
    }
    if (ring3.current) {
      ring3.current.rotation.y = t * 0.5;
      ring3.current.rotation.z = -t * 0.4;
    }
  });

  return (
    <Float speed={3} rotationIntensity={0.5} floatIntensity={0.5}>
      <group ref={group} scale={1.2}>
        <mesh ref={ring1}>
          <torusGeometry args={[2, 0.015, 16, 100]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.3} />
        </mesh>
        <mesh ref={ring2}>
          <torusGeometry args={[2.5, 0.01, 16, 100]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.2} />
        </mesh>
        <mesh ref={ring3}>
          <torusGeometry args={[3, 0.005, 16, 100]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.1} />
        </mesh>

        <mesh>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.05} wireframe />
        </mesh>
      </group>
    </Float>
  );
}
