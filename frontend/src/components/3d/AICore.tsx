import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, MeshTransmissionMaterial, Wireframe, Sphere, Icosahedron } from "@react-three/drei";
import * as THREE from "three";

export function AICore() {
  const group = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef1 = useRef<THREE.Mesh>(null);
  const ringRef2 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (group.current) {
      // Subtle float and rotation mapped to time
      group.current.rotation.y = t * 0.1;
      
      // Mouse parallax
      const targetX = (state.pointer.x * Math.PI) / 10;
      const targetY = (state.pointer.y * Math.PI) / 10;
      
      group.current.rotation.x += (targetY - group.current.rotation.x) * 0.05;
      group.current.rotation.y += (targetX - group.current.rotation.y) * 0.05;
    }

    if (coreRef.current) {
      coreRef.current.rotation.x = t * 0.2;
      coreRef.current.rotation.z = t * 0.3;
    }

    if (ringRef1.current) {
      ringRef1.current.rotation.x = Math.sin(t * 0.5) * 0.5;
      ringRef1.current.rotation.y = t * 0.3;
    }

    if (ringRef2.current) {
      ringRef2.current.rotation.x = Math.cos(t * 0.4) * 0.5;
      ringRef2.current.rotation.y = -t * 0.2;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <group ref={group}>
        
        {/* Inner Glowing Core */}
        <Sphere ref={coreRef} args={[1, 32, 32]}>
          <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.15} />
          <Sphere args={[0.9, 16, 16]}>
             <meshBasicMaterial color="#22d3ee" transparent opacity={0.6} />
          </Sphere>
        </Sphere>

        {/* Glass Outer Shell (Icosahedron) */}
        <Icosahedron args={[1.6, 0]}>
          <MeshTransmissionMaterial
            backside
            samples={4}
            thickness={2}
            roughness={0.1}
            ior={1.5}
            chromaticAberration={0.05}
            transmission={1}
            color="#0f172a"
          />
          <Wireframe fillOpacity={0} strokeOpacity={0.1} stroke="#ffffff" thickness={0.02} />
        </Icosahedron>

        {/* Orbital Rings */}
        <mesh ref={ringRef1} rotation={[Math.PI / 3, 0, 0]}>
          <torusGeometry args={[2.2, 0.01, 16, 100]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.4} />
        </mesh>
        
        <mesh ref={ringRef2} rotation={[-Math.PI / 4, 0, 0]}>
          <torusGeometry args={[2.6, 0.005, 16, 100]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.15} />
        </mesh>

        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={2} color="#ffffff" />
        <pointLight position={[-10, -10, -5]} intensity={1} color="#22d3ee" />
        
      </group>
    </Float>
  );
}
