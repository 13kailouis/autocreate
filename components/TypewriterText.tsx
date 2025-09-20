import React, { useState, useEffect } from 'react';

interface TypewriterTextProps {
  phrases: string[];
  typingSpeed?: number;
  pause?: number;
}

const TypewriterText: React.FC<TypewriterTextProps> = ({
  phrases,
  typingSpeed = 100,
  pause = 1500,
}) => {
  const [displayed, setDisplayed] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    const current = phrases[phraseIndex];
    if (charIndex < current.length) {
      const timeout = setTimeout(() => {
        setDisplayed(current.slice(0, charIndex + 1));
        setCharIndex(charIndex + 1);
      }, typingSpeed);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setCharIndex(0);
      setPhraseIndex((phraseIndex + 1) % phrases.length);
    }, pause);
    return () => clearTimeout(timeout);
  }, [charIndex, phraseIndex, phrases, typingSpeed, pause]);

  return <span>{displayed}</span>;
};

export default TypewriterText;
