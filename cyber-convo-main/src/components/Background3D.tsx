import { Canvas } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Floating particles component
function Particles() {
  const particlesRef = useRef<THREE.Points>(null);
  
  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.1;
      particlesRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  const particleCount = 100;
  const positions = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
  }

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.1}
        color="#00D4FF"
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}

// Animated geometric shapes
function FloatingShapes() {
  return (
    <>
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh position={[-8, 2, -5]}>
          <octahedronGeometry args={[0.5]} />
          <meshStandardMaterial
            color="#8B5CF6"
            transparent
            opacity={0.6}
            emissive="#8B5CF6"
            emissiveIntensity={0.2}
          />
        </mesh>
      </Float>
      
      <Float speed={1.2} rotationIntensity={0.3} floatIntensity={0.3}>
        <mesh position={[8, -2, -8]}>
          <tetrahedronGeometry args={[0.8]} />
          <meshStandardMaterial
            color="#00D4FF"
            transparent
            opacity={0.4}
            emissive="#00D4FF"
            emissiveIntensity={0.3}
          />
        </mesh>
      </Float>

      <Float speed={0.8} rotationIntensity={0.4} floatIntensity={0.6}>
        <mesh position={[0, 4, -10]}>
          <icosahedronGeometry args={[0.6]} />
          <meshStandardMaterial
            color="#EC4899"
            transparent
            opacity={0.5}
            emissive="#EC4899"
            emissiveIntensity={0.25}
          />
        </mesh>
      </Float>
    </>
  );
}

export default function Background3D() {
  return (
    <div className="fixed inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={0.5} color="#00D4FF" />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color="#8B5CF6" />
        
        <Sparkles
          count={50}
          scale={10}
          size={2}
          speed={0.5}
          color="#00D4FF"
        />
        
        <Particles />
        <FloatingShapes />
      </Canvas>
    </div>
  );
}