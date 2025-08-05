


import React, { useState, forwardRef } from 'react';
import styled from 'styled-components';

// ------------------------------------------------------------------
// TYPES
// ------------------------------------------------------------------
interface ZeroingCalibration {
    isCalibrated: boolean;
    accuracyBonus: number;
    environmentalCompensation: {
      solarWind: number;
      heatConcentration: number;
      gravityWell1: number;
      gravityWell2: number;
      weaponDamage: number;
      shipVibration: number;
    };
    lastCalibrated: Date;
    calibrationQuality: 'poor' | 'fair' | 'good' | 'excellent';
  }
  
  interface ZeroingExercise {
    isActive: boolean;
    weaponId: string;
    currentTarget: ZeroingTarget | null;
    targets: ZeroingTarget[];
    shotsRemaining: number;
    totalShots: number;
    score: number;
    accuracy: number;
    phase: 'setup' | 'targeting' | 'firing' | 'results' | 'calibration';
    difficulty: 'novice' | 'intermediate' | 'expert' | 'ace';
  }
  
  interface ZeroingTarget {
    id: string;
    x: number;
    y: number;
    size: number;
    isHit: boolean;
    hitAccuracy: number;
    type: 'static' | 'moving' | 'precision';
  }

interface ZeroingExercise {
  isActive: boolean;
  weaponId: string;
  currentTarget: ZeroingTarget | null;
  targets: ZeroingTarget[];
  shotsRemaining: number;
  totalShots: number;
  score: number;
  accuracy: number;
  phase: 'setup' | 'targeting' | 'firing' | 'results' | 'calibration';
  difficulty: 'novice' | 'intermediate' | 'expert' | 'ace';
}

export interface ZeroingSystemRef {
  startZeroingExercise: (weaponId: string, difficulty?: 'novice' | 'intermediate' | 'expert' | 'ace') => void;
  handleZeroingShot: (x: number, y: number) => void;
  completeZeroingExercise: () => void;
}

interface ZeroingSystemProps {
  onCalibrationComplete?: (weaponId: string, accuracyBonus: number) => void;
}

// ------------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// STYLED COMPONENTS
// ------------------------------------------------------------------
const ZeroingOverlay = styled.div<{ $isActive: boolean }>`
  position: fixed;
  top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.95);
  z-index: 2000;
  display: ${p => p.$isActive ? 'flex' : 'none'};
  align-items: center; justify-content: center;
`;

const ZeroingInterface = styled.div`
  background: rgba(40, 10, 10, 0.8);
  border: 3px solid var(--weapon-blue);
  border-radius: 15px;
  padding: 30px;
  max-width: 800px;
  width: 90%;
  text-align: center;
`;

const ZeroingTitle = styled.h2`
  color: var(--weapon-blue); font-size: 2rem; margin: 0 0 20px;
  text-transform: uppercase; letter-spacing: 2px;
`;

const ZeroingTargetArea = styled.div`
  width: 600px; height: 400px;
  background: radial-gradient(circle at center, #001122 0%, #003366 100%);
  border: 2px solid var(--weapon-green); border-radius: 10px;
  position: relative; margin: 20px auto; cursor: crosshair; overflow: hidden;
`;

const ZeroingTargetCircle = styled.div<{ x: number; y: number; size: number; isHit: boolean }>`
  position: absolute;
  left: ${p => p.x}%; top: ${p => p.y}%;
  width: ${p => p.size}px; height: ${p => p.size}px;
  border: 3px solid ${p => p.isHit ? 'var(--weapon-green)' : 'var(--weapon-red)'};
  border-radius: 50%; transform: translate(-50%, -50%);
  background: ${p => p.isHit ? 'rgba(0,255,65,0.2)' : 'rgba(255,0,64,0.1)'};
`;

const ZeroingButton = styled.button<{ $variant?: 'start' | 'fire' | 'complete' | 'cancel' }>`
  background: ${p => p.$variant === 'fire' ? 'var(--weapon-red)' :
    p.$variant === 'complete' ? 'var(--weapon-green)' :
    p.$variant === 'cancel' ? 'var(--weapon-orange)' : 'var(--weapon-blue)'};
  color: ${p => p.$variant === 'complete' || p.$variant === 'start' ? '#000' : '#fff'};
  border: 2px solid var(--weapon-blue); padding: 15px 30px; margin: 10px;
  font-size: 1.1em; font-weight: bold; cursor: pointer; border-radius: 8px;
  text-transform: uppercase; letter-spacing: 1px;
`;

const ZeroingSystemComponent = forwardRef<ZeroingSystemRef, ZeroingSystemProps>(({ onCalibrationComplete }, ref) => {
  const [zeroingExercise, setZeroingExercise] = useState<ZeroingExercise>({
    isActive: false,
    weaponId: '',
    currentTarget: null,
    targets: [],
    shotsRemaining: 0,
    totalShots: 0,
    score: 0,
    accuracy: 0,
    phase: 'setup',
    difficulty: 'novice'
  });
  
  // ------------------------------------------------------------------
  // LOGIC
  // ------------------------------------------------------------------
  const startZeroingExercise = (
    weaponId: string,
    difficulty: 'novice' | 'intermediate' | 'expert' | 'ace' = 'novice'
  ) => {
    const targetCount = difficulty === 'novice' ? 3 : difficulty === 'intermediate' ? 5 : difficulty === 'expert' ? 7 : 10;
    const shotCount = difficulty === 'novice' ? 5 : difficulty === 'intermediate' ? 8 : difficulty === 'expert' ? 10 : 15;
    const targets: ZeroingTarget[] = [];
    for (let i = 0; i < targetCount; i++) {
      targets.push({
        id: `target_${i}`,
        x: Math.random() * 80 + 10,
        y: Math.random() * 80 + 10,
        size: difficulty === 'ace' ? 20 : difficulty === 'expert' ? 30 : difficulty === 'intermediate' ? 40 : 50,
        isHit: false,
        hitAccuracy: 0,
        type: 'static'
      });
    }
    setZeroingExercise({
      isActive: true,
      weaponId,
      currentTarget: targets[0],
      targets,
      shotsRemaining: shotCount,
      totalShots: shotCount,
      score: 0,
      accuracy: 0,
      phase: 'targeting',
      difficulty
    });
  };
  
  const handleZeroingShot = (clickX: number, clickY: number) => {
    if (!zeroingExercise.isActive || !zeroingExercise.currentTarget || zeroingExercise.shotsRemaining <= 0) return;
    const target = zeroingExercise.currentTarget;
    const distance = Math.sqrt(
      Math.pow(clickX - target.x, 2) + Math.pow(clickY - target.y, 2)
    );
    const isHit = distance <= target.size / 2;
    let hitAccuracy = 0;
    if (isHit) hitAccuracy = Math.max(0, 100 - (distance / (target.size / 2)) * 100);
    const updatedTargets = zeroingExercise.targets.map(t =>
      t.id === target.id ? { ...t, isHit, hitAccuracy } : t
    );
    const newScore = isHit ? zeroingExercise.score + Math.floor(hitAccuracy) : zeroingExercise.score;
    const overallAccuracy = (newScore / ((zeroingExercise.totalShots - zeroingExercise.shotsRemaining + 1) * 100)) * 100;
    const nextTarget = updatedTargets.find(t => !t.isHit) || null;
    setZeroingExercise(prev => ({
      ...prev,
      targets: updatedTargets,
      currentTarget: nextTarget,
      shotsRemaining: prev.shotsRemaining - 1,
      score: newScore,
      accuracy: overallAccuracy,
      phase: nextTarget && prev.shotsRemaining > 1 ? 'targeting' : 'results'
    }));
  };
  
  const completeZeroingExercise = () => {
    if (!zeroingExercise.isActive) return;
    const finalAccuracy = zeroingExercise.accuracy;
    let accuracyBonus = 0;
    let calibrationQuality: 'poor' | 'fair' | 'good' | 'excellent' = 'poor';
    if (finalAccuracy >= 90) { calibrationQuality = 'excellent'; accuracyBonus = 25; }
    else if (finalAccuracy >= 75) { calibrationQuality = 'good'; accuracyBonus = 20; }
    else if (finalAccuracy >= 60) { calibrationQuality = 'fair'; accuracyBonus = 15; }
    else if (finalAccuracy >= 40) { calibrationQuality = 'poor'; accuracyBonus = 10; }
    else { accuracyBonus = 5; }
    
    // Callback to parent component
    if (onCalibrationComplete) {
      onCalibrationComplete(zeroingExercise.weaponId, accuracyBonus);
    }
    
    console.log(`Zeroing complete! Quality: ${calibrationQuality}, Bonus: +${accuracyBonus}% accuracy`);
    setZeroingExercise(prev => ({ ...prev, isActive: false, phase: 'calibration' }));
  };

  // Expose functions through ref
  React.useImperativeHandle(ref, () => ({
    startZeroingExercise,
    handleZeroingShot,
    completeZeroingExercise
  }));
  
  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  return (
    <>
      {zeroingExercise.isActive && (
        <ZeroingOverlay $isActive={zeroingExercise.isActive}>
          <ZeroingInterface>
            <ZeroingTitle>🎯 Zeroing Exercise</ZeroingTitle>
            {zeroingExercise.phase === 'targeting' && (
              <>
                <div style={{ color: 'var(--weapon-yellow)', marginBottom: '15px' }}>
                  <p>Weapon: {zeroingExercise.weaponId}</p>
                  <p>Shots Remaining: {zeroingExercise.shotsRemaining}</p>
                  <p>Current Accuracy: {zeroingExercise.accuracy.toFixed(1)}%</p>
                </div>
                <ZeroingTargetArea
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    handleZeroingShot(x, y);
                  }}
                >
                  {zeroingExercise.targets.map(t => (
                    <ZeroingTargetCircle
                      key={t.id}
                      x={t.x}
                      y={t.y}
                      size={t.size}
                      isHit={t.isHit}
                    />
                  ))}
                </ZeroingTargetArea>
                <ZeroingButton $variant="cancel" onClick={() => setZeroingExercise(prev => ({ ...prev, isActive: false }))}>
                  Cancel
                </ZeroingButton>
              </>
            )}
            {zeroingExercise.phase === 'results' && (
              <>
                <div style={{ color: 'var(--weapon-yellow)', marginBottom: '20px' }}>
                  <h3>Exercise Complete!</h3>
                  <p>Final Accuracy: {zeroingExercise.accuracy.toFixed(1)}%</p>
                  <p>Score: {zeroingExercise.score}/{zeroingExercise.totalShots * 100}</p>
                </div>
                <ZeroingButton $variant="complete" onClick={completeZeroingExercise}>
                  Apply Calibration
                </ZeroingButton>
                <ZeroingButton $variant="cancel" onClick={() => setZeroingExercise(prev => ({ ...prev, isActive: false }))}>
                  Cancel
                </ZeroingButton>
              </>
            )}
          </ZeroingInterface>
        </ZeroingOverlay>
      )}
    </>
  );
});

// Export the component with proper typing
export const ZeroingSystem = ZeroingSystemComponent as React.ForwardRefExoticComponent<ZeroingSystemProps & React.RefAttributes<ZeroingSystemRef>>;

//// Export the component
//export default ZeroingSystem;

// Export types for use in other components
export type { ZeroingExercise, ZeroingTarget, ZeroingCalibration, ZeroingSystemProps };