import { Canvas } from '@react-three/fiber';
import { Float, Sphere } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from 'framer-motion';

interface HolographicAvatarProps {
  isTyping?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

function HologramCore({ isTyping }: { isTyping: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime) * 0.1;
    }
    
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uIntensity.value = isTyping ? 1.5 : 1.0;
    }
  });

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vPosition;
    uniform float uTime;
    
    void main() {
      vUv = uv;
      vPosition = position;
      
      vec3 pos = position;
      pos.x += sin(uTime * 2.0 + position.y * 10.0) * 0.05;
      pos.y += cos(uTime * 1.5 + position.x * 8.0) * 0.05;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  const fragmentShader = `
    varying vec2 vUv;
    varying vec3 vPosition;
    uniform float uTime;
    uniform float uIntensity;
    
    void main() {
      vec2 center = vec2(0.5, 0.5);
      float dist = distance(vUv, center);
      
      vec3 color1 = vec3(0.0, 0.83, 1.0); // Cyan
      vec3 color2 = vec3(0.55, 0.36, 0.96); // Purple
      vec3 color3 = vec3(0.93, 0.28, 0.6); // Pink
      
      vec3 finalColor = mix(color1, color2, sin(uTime + vPosition.x * 5.0) * 0.5 + 0.5);
      finalColor = mix(finalColor, color3, sin(uTime * 1.5 + vPosition.y * 3.0) * 0.3 + 0.3);
      
      float alpha = (1.0 - dist) * 0.8;
      alpha *= (sin(uTime * 3.0 + dist * 10.0) * 0.2 + 0.8) * uIntensity;
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;

  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          uniforms={{
            uTime: { value: 0 },
            uIntensity: { value: 1.0 }
          }}
        />
      </mesh>
    </Float>
  );
}

export default function HolographicAvatar({ 
  isTyping = false, 
  size = 'md' 
}: HolographicAvatarProps) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  return (
    <motion.div
      className={`${sizeClasses[size]} relative`}
      animate={{
        scale: isTyping ? [1, 1.1, 1] : 1,
      }}
      transition={{
        duration: 1.5,
        repeat: isTyping ? Infinity : 0,
        ease: "easeInOut"
      }}
    >
      <div className="absolute inset-0 rounded-full bg-primary/20 blur-md animate-glow-pulse" />
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden border border-primary/30`}>
        <Canvas camera={{ position: [0, 0, 3] }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[2, 2, 2]} intensity={1} color="#00D4FF" />
          <HologramCore isTyping={isTyping} />
        </Canvas>
      </div>
    </motion.div>
  );
}