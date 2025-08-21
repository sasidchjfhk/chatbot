import { motion } from 'framer-motion';
import HolographicAvatar from './HolographicAvatar';

export default function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="flex gap-4 items-start"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <HolographicAvatar size="sm" isTyping={true} />
      </div>

      {/* Typing Animation */}
      <div className="bot-bubble mr-8 p-4 rounded-2xl backdrop-blur-xl border relative">
        <div className="flex items-center gap-1">
          <motion.div
            className="typing-dot"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.7, 1, 0.7]
            }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="typing-dot"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.7, 1, 0.7]
            }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.2
            }}
          />
          <motion.div
            className="typing-dot"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.7, 1, 0.7]
            }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.4
            }}
          />
        </div>

        {/* Glow effect */}
        <div className="absolute inset-0 rounded-2xl bg-secondary blur-xl opacity-20 -z-10" />
      </div>
    </motion.div>
  );
}