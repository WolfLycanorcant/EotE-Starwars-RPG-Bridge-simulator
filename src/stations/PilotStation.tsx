import React, { useState, useEffect, useRef } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { io, Socket } from 'socket.io-client';
import './PilotStation.css';

// Module-level variable for star animation offset
let starOffset = 0;

// Types
interface PilotState {
  heading: {
    x: number;
    y: number;
  };
  speed: number;
  altitude: number;
  alert: string;
  hyperdriveStatus: 'ready' | 'charging' | 'jumping' | 'cooldown';
  fuelLevel: number;
  shieldStatus: number;
  engineTemp: number;
  navigationComputer: {
    targetSystem: string;
    jumpDistance: number;
    eta: number;
  };
  autopilot: boolean;
  emergencyPower: boolean;
  hypermatter: {
    current: number;
    maximum: number;
    consumptionRate: number; // units per hour
  };
  jumpPlanning: {
    duration: number; // hours
    hypermatterRequired: number;
    isPlanning: boolean;
  };
  asteroidField: {
    asteroids: Array<{
      id: number;
      x: number;
      y: number;
      size: number;
      speed: number;
      angle: number;
    }>;
    gameActive: boolean;
    score: number;
    environmentalHazard: {
      type: 'none' | 'asteroid_field' | 'gravity_well' | 'ion_storm' | 'solar_flare';
      intensity: string;
      active: boolean;
    };
    enemyShip: {
      active: boolean;
      y: number;
      size: number;
      chasing: boolean;
    };
  };
}

interface PlayerAction {
  room: string;
  action: string;
  value?: number;
}

// Animations
const blink = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
`;

const scanLine = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const hyperdriveCharge = keyframes`
  0% { box-shadow: 0 0 5px var(--starwars-blue); }
  50% { box-shadow: 0 0 20px var(--starwars-blue), 0 0 30px var(--starwars-blue); }
  100% { box-shadow: 0 0 5px var(--starwars-blue); }
`;

const pulse = keyframes`
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
`;

// Styled Components
const Container = styled.div`
  background: #111;
  color: #fff;
  font-family: 'Orbitron', 'Arial', sans-serif;
  height: 100vh;
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  
  --starwars-blue: #007bff;
  --starwars-green: #22b14c;
  --starwars-yellow: #ffd700;
  --starwars-red: #dc3545;
  --bg-dark: #111;
  --text-light: #fff;
  
  /* Custom scrollbar styling */
  &::-webkit-scrollbar {
    width: 12px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--starwars-blue);
    border-radius: 6px;
    border: 2px solid rgba(0, 0, 0, 0.3);
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: var(--starwars-yellow);
  }
`;

const StationHeader = styled.h1`
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 30px;
  color: var(--starwars-blue);
  text-shadow: 0 0 10px var(--starwars-blue);
  letter-spacing: 3px;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const StatusCard = styled.div`
  background: rgba(0, 0, 0, 0.7);
  padding: 20px;
  border: 2px solid var(--starwars-blue);
  border-radius: 10px;
  backdrop-filter: blur(5px);
  
  h2 {
    margin: 0 0 15px 0;
    color: var(--starwars-blue);
    font-size: 1.2rem;
  }
`;

const StatusValue = styled.div<{ alert?: string; size?: 'large' | 'medium' | 'small' }>`
  font-size: ${props =>
    props.size === 'large' ? '3em' :
      props.size === 'small' ? '1.8em' :
        props.size === 'medium' ? '2.2em' :
          '2.5em'
  };
  font-weight: bold;
  margin: 10px 0;
  
  ${props => props.alert === 'red' && css`
    color: var(--starwars-red);
    animation: ${blink} 1s infinite;
  `}
  
  ${props => props.alert === 'yellow' && css`
    color: var(--starwars-yellow);
  `}
`;

const StatusMessage = styled.div<{ alert?: string }>`
  font-size: 1.2em;
  margin: 10px 0;
  
  ${props => props.alert === 'red' && css`
    color: var(--starwars-red);
    animation: ${blink} 1s infinite;
  `}
  
  ${props => props.alert === 'yellow' && css`
    color: var(--starwars-yellow);
  `}
`;

const InstrumentPanel = styled.div`
  display: flex;
  gap: 30px;
  justify-content: center;
  margin: 30px 0;
  flex-wrap: wrap;
`;

const InstrumentContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

const InstrumentLabel = styled.div`
  font-size: 1.1rem;
  color: var(--starwars-yellow);
  text-align: center;
  font-weight: bold;
`;

const ArtificialHorizon = styled.div`
  width: 300px;
  height: 200px;
  background: #000;
  border: 2px solid var(--starwars-blue);
  position: relative;
  overflow: hidden;
  border-radius: 10px;
  box-shadow: inset 0 0 20px rgba(0, 123, 255, 0.3);
`;

const HorizonLine = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--starwars-yellow);
  top: 50%;
  box-shadow: 0 0 5px var(--starwars-yellow);
`;

const PitchIndicator = styled.div<{ pitch: number }>`
  position: absolute;
  left: 50%;
  top: 0%;
  width: 2px;
  height: 100%;
  background: var(--starwars-blue);
  transform-origin: center center;
  transform: rotate(${props => -props.pitch}deg) translateX(-50%);
  box-shadow: 0 0 5px var(--starwars-blue);
`;

const RollIndicator = styled.div<{ roll: number }>`
  position: absolute;
  left: 0%;
  top: 50%;
  width: 100%;
  height: 2px;
  background: var(--starwars-green);
  transform-origin: center center;
  transform: rotate(${props => props.roll}deg) translateY(-50%);
  box-shadow: 0 0 5px var(--starwars-green);
`;

const DegreeMark = styled.div<{ position: number }>`
  position: absolute;
  width: 2px;
  height: 10px;
  background: var(--starwars-yellow);
  left: 50%;
  top: ${props => props.position}%;
  transform: translateX(-50%);
`;

const CircularGauge = styled.div`
  width: 200px;
  height: 200px;
  background: #000;
  border: 2px solid var(--starwars-blue);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: inset 0 0 20px rgba(0, 123, 255, 0.3);
`;

const GaugeDial = styled.div`
  width: 180px;
  height: 180px;
  border-radius: 50%;
  border: 2px solid var(--starwars-yellow);
  position: relative;
  background: radial-gradient(circle at center, #000 0%, #1a1a1a 100%);
`;

const GaugeNeedle = styled.div<{ angle: number }>`
  position: absolute;
  width: 3px;
  height: 90px;
  background: var(--starwars-yellow);
  transform-origin: bottom center;
  left: 50%;
  bottom: 50%;
  transform: translateX(-50%) rotate(${props => props.angle}deg);
  box-shadow: 0 0 5px var(--starwars-yellow);
  
  &::after {
    content: '';
    position: absolute;
    top: -5px;
    left: -2px;
    width: 7px;
    height: 7px;
    background: var(--starwars-yellow);
    border-radius: 50%;
  }
`;

const GaugeValue = styled.div`
  position: absolute;
  font-size: 1.5em;
  color: var(--starwars-yellow);
  text-align: center;
  width: 100%;
  top: 60%;
  font-weight: bold;
  text-shadow: 0 0 5px var(--starwars-yellow);
`;

const GaugeLabel = styled.div`
  position: absolute;
  font-size: 0.9em;
  color: var(--starwars-yellow);
  text-align: center;
  width: 100%;
  bottom: 15px;
`;

const SpeedArc = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

const ControlsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 30px;
  margin: 30px 0;
`;

const AxisControl = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  background: rgba(0, 0, 0, 0.5);
  padding: 20px;
  border: 1px solid var(--starwars-blue);
  border-radius: 10px;
`;

const AxisLabel = styled.h3`
  font-size: 1.2em;
  color: var(--starwars-blue);
  margin: 0;
`;

const AxisValue = styled.div`
  font-size: 2em;
  color: var(--starwars-yellow);
  font-weight: bold;
  text-shadow: 0 0 5px var(--starwars-yellow);
`;

const Slider = styled.input`
  width: 100%;
  max-width: 200px;
  height: 8px;
  background: #333;
  border-radius: 5px;
  outline: none;
  
  &::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    background: var(--starwars-yellow);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 10px var(--starwars-yellow);
  }
  
  &::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--starwars-yellow);
    border-radius: 50%;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 10px var(--starwars-yellow);
  }
`;

const VerticalSlider = styled(Slider)`
  width: 20px;
  height: 200px;
  writing-mode: bt-lr;
  -webkit-appearance: slider-vertical;
`;

const MacroButtons = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-top: 30px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
`;

const MacroButton = styled.button<{ variant?: 'danger' | 'warning' | 'success' | 'disabled' }>`
  background: ${props =>
    props.variant === 'danger' ? 'var(--starwars-red)' :
      props.variant === 'warning' ? '#ff8c00' :
        props.variant === 'success' ? 'var(--starwars-green)' :
          props.variant === 'disabled' ? '#666' :
            'var(--starwars-yellow)'
  };
  color: ${props => props.variant === 'disabled' ? '#999' : '#000'};
  border: 2px solid var(--starwars-blue);
  padding: 15px 10px;
  font-size: 1.1em;
  font-weight: bold;
  cursor: ${props => props.variant === 'disabled' ? 'not-allowed' : 'pointer'};
  transition: all 0.3s;
  border-radius: 5px;
  
  &:hover {
    background: ${props => props.variant === 'disabled' ? '#666' : 'var(--starwars-blue)'};
    color: ${props => props.variant === 'disabled' ? '#999' : '#fff'};
    transform: ${props => props.variant === 'disabled' ? 'none' : 'scale(1.05)'};
    box-shadow: ${props => props.variant === 'disabled' ? 'none' : '0 0 15px var(--starwars-blue)'};
  }
  
  &:active {
    transform: ${props => props.variant === 'disabled' ? 'none' : 'scale(0.95)'};
  }
`;

const HyperdrivePanel = styled.div<{ status: string }>`
  background: rgba(0, 0, 0, 0.7);
  padding: 25px;
  border: 2px solid var(--starwars-blue);
  border-radius: 12px;
  margin: 30px 0;
  text-align: center;
  backdrop-filter: blur(5px);
  
  ${props => props.status === 'charging' && css`
    animation: ${hyperdriveCharge} 2s infinite;
    border-color: var(--starwars-yellow);
  `}
  
  ${props => props.status === 'jumping' && css`
    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.7) 100%);
    border-color: var(--starwars-yellow);
    animation: ${pulse} 0.5s infinite;
  `}
  
  h3 {
    margin: 0 0 15px 0;
    color: var(--starwars-blue);
    font-size: 1.4rem;
  }
`;

const NavigationComputer = styled.div`
  background: rgba(0, 0, 0, 0.8);
  padding: 20px;
  border: 2px solid var(--starwars-green);
  border-radius: 10px;
  margin: 20px 0;
  
  h3 {
    margin: 0 0 15px 0;
    color: var(--starwars-green);
    font-size: 1.3rem;
  }
  
  .nav-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    font-family: 'Courier New', monospace;
  }
  
  .nav-item {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    border-bottom: 1px solid rgba(34, 177, 76, 0.3);
  }
  
  .nav-label {
    color: var(--starwars-green);
    font-weight: bold;
  }
  
  .nav-value {
    color: var(--starwars-yellow);
  }
`;

const SystemStatus = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 15px;
  margin: 20px 0;
`;

const SystemCard = styled.div<{ status: 'good' | 'warning' | 'critical' }>`
  background: rgba(0, 0, 0, 0.6);
  padding: 15px;
  border: 2px solid ${props =>
    props.status === 'critical' ? 'var(--starwars-red)' :
      props.status === 'warning' ? 'var(--starwars-yellow)' :
        'var(--starwars-green)'
  };
  border-radius: 8px;
  text-align: center;
  
  ${props => props.status === 'critical' && css`
    animation: ${blink} 1.5s infinite;
  `}
  
  h4 {
    margin: 0 0 10px 0;
    color: ${props =>
    props.status === 'critical' ? 'var(--starwars-red)' :
      props.status === 'warning' ? 'var(--starwars-yellow)' :
        'var(--starwars-green)'
  };
    font-size: 0.9rem;
    text-transform: uppercase;
  }
  
  .system-value {
    font-size: 1.8rem;
    font-weight: bold;
    color: ${props =>
    props.status === 'critical' ? 'var(--starwars-red)' :
      props.status === 'warning' ? 'var(--starwars-yellow)' :
        'var(--starwars-green)'
  };
  }
  
  .system-unit {
    font-size: 0.8rem;
    color: #ccc;
  }
`;

const ToggleSwitch = styled.button<{ active: boolean }>`
  background: ${props => props.active ? 'var(--starwars-green)' : '#333'};
  color: ${props => props.active ? '#000' : '#ccc'};
  border: 2px solid ${props => props.active ? 'var(--starwars-green)' : '#666'};
  padding: 10px 20px;
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: bold;
  text-transform: uppercase;
  
  &:hover {
    background: ${props => props.active ? 'var(--starwars-yellow)' : 'var(--starwars-blue)'};
    color: #000;
    border-color: var(--starwars-blue);
  }
`;

// Asteroid Field Component
const AsteroidField: React.FC<{
  pilotState: PilotState;
  setPilotState: React.Dispatch<React.SetStateAction<PilotState>>;
}> = ({ pilotState, setPilotState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const shipRef = useRef({ x: 150, y: 250 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 300;
    canvas.height = 300;

    let asteroids = pilotState.asteroidField.asteroids;
    let gameActive = pilotState.asteroidField.gameActive;
    let score = pilotState.asteroidField.score;

    const generateAsteroid = () => {
      return {
        id: Math.random(),
        x: Math.random() * 300,
        y: -20,
        size: 2 + Math.random() * 3,
        speed: 0.3 + Math.random() * 0.7,
        angle: Math.random() * Math.PI * 2
      };
    };

    const updateGame = () => {
      if (!gameActive) return;

      // Generate new asteroids
      if (Math.random() < 0.02) {
        asteroids.push(generateAsteroid());
      }

      // Update asteroids
      asteroids = asteroids.map(asteroid => ({
        ...asteroid,
        y: asteroid.y + asteroid.speed,
        size: asteroid.size + 0.02 // Grow as they get closer
      })).filter(asteroid => asteroid.y < 320);

      // Check collisions
      const ship = shipRef.current;
      const collidedAsteroid = asteroids.find(asteroid => {
        const dx = asteroid.x - ship.x;
        const dy = asteroid.y - ship.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < asteroid.size + 8;
      });

      if (collidedAsteroid) {
        // Remove the collided asteroid
        asteroids = asteroids.filter(asteroid => asteroid.id !== collidedAsteroid.id);

        // Reduce shields by 5%
        setPilotState(prev => ({
          ...prev,
          shieldStatus: Math.max(0, prev.shieldStatus - 5),
          asteroidField: {
            ...prev.asteroidField,
            asteroids,
            score,
            gameActive
          },
          alert: 'yellow' // Brief yellow alert for shield hit
        }));

        // Reset alert after 1 second
        setTimeout(() => {
          setPilotState(prev => ({ ...prev, alert: 'normal' }));
        }, 1000);

        console.log('💥 Asteroid collision! Shields reduced by 5%');
      } else {
        score += 1;
        setPilotState(prev => ({
          ...prev,
          asteroidField: {
            ...prev.asteroidField,
            asteroids,
            score,
            gameActive
          }
        }));
      }
    };

    const draw = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 300, 300);

      // Draw environmental hazard effects
      const hazard = pilotState.asteroidField.environmentalHazard;
      if (hazard.active) {
        const time = Date.now() * 0.001; // Time for animations

        switch (hazard.type) {
          case 'asteroid_field':
            // Enhanced asteroid field - more dense asteroids with red tint
            ctx.fillStyle = 'rgba(255, 100, 100, 0.1)';
            ctx.fillRect(0, 0, 300, 300);
            // Add extra visual asteroids (non-interactive)
            for (let i = 0; i < 20; i++) {
              const x = (Math.sin(time + i) * 100 + 150) % 300;
              const y = (Math.cos(time * 0.5 + i) * 100 + 150) % 300;
              ctx.fillStyle = '#ff6666';
              ctx.beginPath();
              ctx.arc(x, y, 2 + Math.sin(time + i) * 1, 0, Math.PI * 2);
              ctx.fill();
            }
            break;

          case 'gravity_well':
            // Gravity well - swirling distortion effect
            ctx.save();
            ctx.translate(150, 150);
            for (let i = 0; i < 8; i++) {
              const angle = (time + i * Math.PI / 4) % (Math.PI * 2);
              const radius = 50 + Math.sin(time * 2 + i) * 20;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;

              ctx.strokeStyle = `rgba(138, 43, 226, ${0.8 - (radius / 100)})`;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(x, y, 5, 0, Math.PI * 2);
              ctx.stroke();
            }
            // Central gravity well
            ctx.strokeStyle = '#8a2be2';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 30 + Math.sin(time * 3) * 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            break;

          case 'ion_storm':
            // Ion storm - electrical discharge effects
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            for (let i = 0; i < 15; i++) {
              const startX = Math.random() * 300;
              const startY = Math.random() * 300;
              const endX = startX + (Math.random() - 0.5) * 60;
              const endY = startY + (Math.random() - 0.5) * 60;

              if (Math.sin(time * 10 + i) > 0.7) {
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
              }
            }
            // Add blue tint
            ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
            ctx.fillRect(0, 0, 300, 300);
            break;

          case 'solar_flare':
            // Solar flare - intense orange/yellow radiation waves
            ctx.save();
            ctx.translate(150, 150);
            for (let i = 0; i < 6; i++) {
              const radius = (time * 50 + i * 30) % 200;
              const opacity = Math.max(0, 1 - radius / 200);
              ctx.strokeStyle = `rgba(255, ${165 - radius}, 0, ${opacity * 0.6})`;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(0, 0, radius, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.restore();
            // Add orange tint
            ctx.fillStyle = 'rgba(255, 165, 0, 0.1)';
            ctx.fillRect(0, 0, 300, 300);
            break;
        }
      }

      // Draw moving stars based on sublight speed
      ctx.fillStyle = '#fff';
      const speedFactor = pilotState.speed / 100; // Convert speed percentage to 0-1 factor

      // Use a persistent star offset that accumulates based on current speed each frame
      starOffset += speedFactor * 1.5; // Accumulate movement based on current speed each frame

      for (let i = 0; i < 50; i++) {
        const baseX = (i * 37) % 300;
        const baseY = (i * 23) % 300;

        // Move stars downward based on accumulated offset with slight variation per star
        const starMovement = starOffset * (1 + i * 0.02);
        const movingY = (baseY + starMovement) % 320; // Wrapping
        const x = baseX;
        const y = movingY - 20; // Start stars slightly above canvas

        // Only draw stars that are within the canvas
        if (y >= 0 && y <= 300) {
          // Make stars streak when moving fast
          if (speedFactor > 0.3) {
            ctx.fillRect(x, y, 1, 1 + speedFactor * 4); // Vertical streaks at high speed
          } else {
            ctx.fillRect(x, y, 1, 1); // Normal dots at low speed
          }
        }
      }

      // Draw enemy ship if active
      const enemyShip = pilotState.asteroidField.enemyShip;
      if (enemyShip.active) {
        // Update enemy ship position based on player speed
        let newEnemyY = enemyShip.y;
        if (pilotState.speed < 50) {
          // Enemy gains on player if speed is less than 50%
          newEnemyY = Math.max(200, enemyShip.y - 1.5); // Move up (gaining)
        } else {
          // Enemy falls behind if speed is 50% or more
          newEnemyY = Math.min(350, enemyShip.y + 0.5); // Move down (falling behind)
        }

        // Update enemy ship state
        setPilotState(prev => ({
          ...prev,
          asteroidField: {
            ...prev.asteroidField,
            enemyShip: {
              ...prev.asteroidField.enemyShip,
              y: newEnemyY,
              chasing: pilotState.speed < 50
            }
          }
        }));

        // Draw enemy ship (large red triangle)
        ctx.fillStyle = enemyShip.chasing ? '#ff0000' : '#ff6666';
        ctx.beginPath();
        ctx.moveTo(150, newEnemyY); // Top point
        ctx.lineTo(130, newEnemyY + 20); // Bottom left
        ctx.lineTo(170, newEnemyY + 20); // Bottom right
        ctx.closePath();
        ctx.fill();

        // Add engine glow
        ctx.fillStyle = enemyShip.chasing ? '#ffff00' : '#ff8888';
        ctx.beginPath();
        ctx.arc(150, newEnemyY + 15, 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw warning text if enemy is gaining
        if (enemyShip.chasing) {
          ctx.fillStyle = '#ff0000';
          ctx.font = 'bold 12px Orbitron';
          ctx.textAlign = 'center';
          ctx.fillText('ENEMY PURSUIT', 150, 280);
          ctx.fillText('INCREASE SPEED!', 150, 295);
          ctx.textAlign = 'left';
        }
      }

      // Draw ship
      const ship = shipRef.current;
      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y - 8);
      ctx.lineTo(ship.x - 6, ship.y + 8);
      ctx.lineTo(ship.x + 6, ship.y + 8);
      ctx.closePath();
      ctx.fill();

      // Draw asteroids
      asteroids.forEach(asteroid => {
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.arc(asteroid.x, asteroid.y, asteroid.size, 0, Math.PI * 2);
        ctx.fill();

        // Add glow effect for larger asteroids
        if (asteroid.size > 8) {
          ctx.strokeStyle = '#ff4444';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });

      // Draw hazard warning text
      if (hazard.active) {
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 14px Orbitron';
        ctx.textAlign = 'center';
        const hazardNames: Record<string, string> = {
          asteroid_field: 'ASTEROID FIELD',
          gravity_well: 'GRAVITY WELL',
          ion_storm: 'ION STORM',
          solar_flare: 'SOLAR FLARE'
        };
        ctx.fillText(hazardNames[hazard.type] || 'HAZARD', 150, 25);
        ctx.textAlign = 'left';
      }

      // Draw UI
      ctx.fillStyle = '#00ffff';
      ctx.font = '12px Orbitron';
      // ctx.fillText(`Score: ${score}`, 10, 20); // Hidden score display

      if (!gameActive && asteroids.length === 0) {
        // Game ready but waiting for GM to start
      }

      updateGame();
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [pilotState.asteroidField.gameActive, pilotState.asteroidField.environmentalHazard, pilotState.speed]);

  // Update ship position based on heading
  useEffect(() => {
    const ship = shipRef.current;
    const targetX = 150 + (pilotState.heading.x / 180) * 100;
    const targetY = 250 + (pilotState.heading.y / 90) * 50;

    ship.x = Math.max(10, Math.min(290, targetX));
    ship.y = Math.max(10, Math.min(290, targetY));
  }, [pilotState.heading.x, pilotState.heading.y]);

  const startGame = () => {
    setPilotState(prev => ({
      ...prev,
      asteroidField: {
        ...prev.asteroidField,
        asteroids: [],
        gameActive: true,
        score: 0
      }
    }));
  };

  return (
    <canvas
      ref={canvasRef}
      className="actuator-canvas"
      style={{
        width: '100%',
        height: '100%',
        cursor: 'none',
        border: '1px solid var(--cockpit-primary)'
      }}
    />
  );
};

// Component
const PilotStation: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [pilotState, setPilotState] = useState<PilotState>({
    heading: { x: 0, y: 0 },
    speed: 0,
    altitude: 1000,
    alert: 'normal',
    hyperdriveStatus: 'ready',
    fuelLevel: 85,
    shieldStatus: 92,
    engineTemp: 45,
    navigationComputer: {
      targetSystem: 'Coruscant',
      jumpDistance: 0.167, // 0.167 parsecs per hour (starts with 1 hour default)
      eta: 0
    },
    autopilot: false,
    emergencyPower: false,
    hypermatter: {
      current: 80,
      maximum: 80,
      consumptionRate: 2.5 // 2.5 tons per hour
    },
    jumpPlanning: {
      duration: 1,
      hypermatterRequired: 2.5,
      isPlanning: false
    },
    asteroidField: {
      asteroids: [],
      gameActive: false,
      score: 0,
      environmentalHazard: {
        type: 'none',
        intensity: '',
        active: false
      },
      enemyShip: {
        active: false,
        y: 300,
        size: 20,
        chasing: false
      }
    }
  });
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    // Get room from URL params
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || 'default';

    newSocket.emit('join', { room, station: 'navigation' });

    // Listen for state updates
    newSocket.on('state_update', (state: Partial<PilotState>) => {
      // Merge incoming state with previous state to prevent missing properties
      setPilotState(prev => ({
        ...prev,  // Keep existing state
        ...state  // Override with incoming state (only updates provided properties)
      }));
    });

    // Listen for weapon sounds from other stations
    newSocket.on('player_action', (data: any) => {
      if (data.action === 'weapon_sound' && audioEnabled) {
        playWeaponSound();
      }
    });

    // Listen for GM broadcasts for navigation control
    newSocket.on('gm_broadcast', (data: { type: string; value: any; room: string; source: string }) => {
      console.log('🚀 Navigation Station received GM broadcast:', data);

      if (data.source === 'gm') {
        switch (data.type) {
          case 'distance_to_mass_update':
            console.log('📡 GM updating distance to mass:', data.value);
            setPilotState(prev => ({
              ...prev,
              altitude: data.value
            }));
            break;
          case 'navigation_update':
            console.log('🎮 GM navigation update:', data.value);
            if (data.value.speed !== undefined) {
              setPilotState(prev => ({
                ...prev,
                speed: data.value.speed
              }));
            }
            break;
          case 'navigation_malfunction':
            console.log('⚠️ GM navigation malfunction:', data.value);
            setPilotState(prev => ({
              ...prev,
              alert: 'red'
            }));
            // Reset alert after 5 seconds
            setTimeout(() => {
              setPilotState(prev => ({ ...prev, alert: 'normal' }));
            }, 5000);
            break;
          case 'navigation_hazard':
            console.log('🌪️ GM navigation hazard received:', data.value);
            console.log('🌪️ Setting hazard type:', data.value.type, 'intensity:', data.value.intensity);
            setPilotState(prev => {
              const newState = {
                ...prev,
                alert: 'yellow',
                asteroidField: {
                  ...prev.asteroidField,
                  environmentalHazard: {
                    type: data.value.type,
                    intensity: data.value.intensity,
                    active: true
                  },
                  // Start the asteroid game if the hazard is asteroid_field
                  gameActive: data.value.type === 'asteroid_field' ? true : prev.asteroidField.gameActive,
                  asteroids: data.value.type === 'asteroid_field' ? [] : prev.asteroidField.asteroids,
                  score: data.value.type === 'asteroid_field' ? 0 : prev.asteroidField.score
                }
              };
              console.log('🌪️ New pilot state hazard:', newState.asteroidField.environmentalHazard);
              if (data.value.type === 'asteroid_field') {
                console.log('🎮 Starting asteroid field game due to ASTEROIDS hazard');
              }
              return newState;
            });
            // Reset alert after 3 seconds but keep hazard active
            setTimeout(() => {
              setPilotState(prev => ({ ...prev, alert: 'normal' }));
            }, 3000);
            // Reset hazard after 10 seconds
            setTimeout(() => {
              console.log('🌪️ Clearing environmental hazard after 10 seconds');
              setPilotState(prev => ({
                ...prev,
                asteroidField: {
                  ...prev.asteroidField,
                  environmentalHazard: {
                    type: 'none',
                    intensity: '',
                    active: false
                  },
                  // Stop the game when asteroid hazard ends
                  gameActive: prev.asteroidField.environmentalHazard.type === 'asteroid_field' ? false : prev.asteroidField.gameActive,
                  asteroids: prev.asteroidField.environmentalHazard.type === 'asteroid_field' ? [] : prev.asteroidField.asteroids
                }
              }));
            }, 10000);
            break;
          case 'hyperdrive_control':
            console.log('🚀 GM hyperdrive control:', data.value);
            if (data.value.action === 'force_ready') {
              setPilotState(prev => ({ ...prev, hyperdriveStatus: 'ready' }));
            } else if (data.value.action === 'force_charge') {
              setPilotState(prev => ({ ...prev, hyperdriveStatus: 'charging' }));
            } else if (data.value.action === 'force_jump') {
              setPilotState(prev => ({ ...prev, hyperdriveStatus: 'jumping' }));
            } else if (data.value.action === 'emergency_stop' || data.value.action === 'disable') {
              setPilotState(prev => ({ ...prev, hyperdriveStatus: 'cooldown' }));
            } else if (data.value.action === 'cooldown') {
              setPilotState(prev => ({ ...prev, hyperdriveStatus: 'cooldown' }));
            }
            break;
          case 'fuel_control':
            console.log('⛽ GM fuel control:', data.value);
            if (data.value.action === 'refuel') {
              setPilotState(prev => ({
                ...prev,
                fuelLevel: Math.min(100, prev.fuelLevel + data.value.amount)
              }));
            } else if (data.value.action === 'drain') {
              setPilotState(prev => ({
                ...prev,
                fuelLevel: Math.max(0, prev.fuelLevel - data.value.amount)
              }));
            } else if (data.value.action === 'critical') {
              setPilotState(prev => ({
                ...prev,
                fuelLevel: data.value.level
              }));
            } else if (data.value.action === 'set_level') {
              setPilotState(prev => ({
                ...prev,
                fuelLevel: Math.max(0, Math.min(100, data.value.level))
              }));
            }
            break;
          case 'emergency_scenario':
            console.log('🚨 GM emergency scenario:', data.value);
            if (data.value.type === 'total_system_failure') {
              setPilotState(prev => ({
                ...prev,
                alert: 'red',
                autopilot: false,
                hyperdriveStatus: 'cooldown'
              }));
            } else if (data.value.type === 'restore_systems') {
              setPilotState(prev => ({
                ...prev,
                alert: 'normal',
                hyperdriveStatus: 'ready'
              }));
            }
            break;
          case 'hypermatter_control':
            console.log('⚡ GM hypermatter control:', data.value);
            if (data.value.action === 'set_amount') {
              setPilotState(prev => ({
                ...prev,
                hypermatter: {
                  ...prev.hypermatter,
                  current: data.value.amount
                }
              }));
            } else if (data.value.action === 'refill') {
              setPilotState(prev => ({
                ...prev,
                hypermatter: {
                  ...prev.hypermatter,
                  current: prev.hypermatter.maximum
                }
              }));
            } else if (data.value.action === 'add') {
              setPilotState(prev => ({
                ...prev,
                hypermatter: {
                  ...prev.hypermatter,
                  current: Math.min(prev.hypermatter.maximum, prev.hypermatter.current + data.value.amount)
                }
              }));
            } else if (data.value.action === 'drain') {
              setPilotState(prev => ({
                ...prev,
                hypermatter: {
                  ...prev.hypermatter,
                  current: Math.max(0, prev.hypermatter.current - data.value.amount)
                }
              }));
            } else if (data.value.action === 'critical') {
              setPilotState(prev => ({
                ...prev,
                hypermatter: {
                  ...prev.hypermatter,
                  current: data.value.amount
                }
              }));
            }
            break;
          case 'asteroid_field_control':
            console.log('🌌 GM asteroid field control:', data.value);
            if (data.value.action === 'start') {
              setPilotState(prev => ({
                ...prev,
                asteroidField: {
                  ...prev.asteroidField,
                  asteroids: [],
                  gameActive: true,
                  score: 0
                }
              }));
            } else if (data.value.action === 'stop') {
              setPilotState(prev => ({
                ...prev,
                asteroidField: {
                  ...prev.asteroidField,
                  asteroids: [],
                  gameActive: false,
                  score: 0
                }
              }));
            }
            break;
          case 'enemy_pursuit':
            console.log('🚨 GM enemy pursuit control:', data.value);
            if (data.value.action === 'activate') {
              setPilotState(prev => ({
                ...prev,
                asteroidField: {
                  ...prev.asteroidField,
                  enemyShip: {
                    active: true,
                    y: 300,
                    size: 20,
                    chasing: true
                  }
                },
                alert: 'red'
              }));
              // Reset alert after 3 seconds but keep enemy active
              setTimeout(() => {
                setPilotState(prev => ({ ...prev, alert: 'normal' }));
              }, 3000);
            } else if (data.value.action === 'deactivate') {
              setPilotState(prev => ({
                ...prev,
                asteroidField: {
                  ...prev.asteroidField,
                  enemyShip: {
                    active: false,
                    y: 300,
                    size: 20,
                    chasing: false
                  }
                }
              }));
            }
            break;
          case 'shield_update':
            console.log('🛡️ GM shield update:', data.value);
            if (data.value.shieldStatus !== undefined) {
              setPilotState(prev => ({
                ...prev,
                shieldStatus: data.value.shieldStatus
              }));
            }
            break;
          case 'engine_temp_control':
            console.log('🌡️ GM engine temperature control:', data.value);
            if (data.value.action === 'set_temperature' && data.value.temperature !== undefined) {
              setPilotState(prev => ({
                ...prev,
                engineTemp: Math.max(0, Math.min(120, data.value.temperature))
              }));
            }
            break;
        }
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [audioEnabled]);

  // Stream actuator canvas to GM Station
  useEffect(() => {
    if (!socket) return;

    let streamInterval: NodeJS.Timeout;

    // Wait a bit for socket connection to be fully established
    const startDelay = setTimeout(() => {
      const streamCanvas = () => {
        const canvas = document.querySelector('.actuator-canvas') as HTMLCanvasElement;
        if (canvas) {
          const params = new URLSearchParams(window.location.search);
          const room = params.get('room') || 'default';

          // Convert canvas to base64 image data
          const imageData = canvas.toDataURL('image/png');

          console.log('🎥 Streaming canvas to GM Station, room:', room, 'data length:', imageData.length);

          // Emit the canvas image to GM Station
          socket.emit('actuator_stream', {
            room,
            imageData
          });
        } else {
          console.warn('⚠️ Canvas with class .actuator-canvas not found for streaming');
        }
      };

      // Stream canvas at 30 FPS
      streamInterval = setInterval(streamCanvas, 33); // ~30 FPS
    }, 1000); // Wait 1 second for socket to be ready

    return () => {
      clearTimeout(startDelay);
      if (streamInterval) {
        clearInterval(streamInterval);
      }
    };
  }, [socket]);

  // Simulate altitude changes and system updates (like in original example_instruments.html)
  useEffect(() => {
    const systemInterval = setInterval(() => {
      setPilotState(prev => {
        // Calculate altitude change based on vertical heading and speed
        const verticalComponent = (prev.heading.y / 90) * (prev.speed / 100);
        const altitudeChange = verticalComponent * 50;
        const newAltitude = Math.max(0, prev.altitude + altitudeChange);

        // Simulate fuel consumption based on speed and engine temp
        const fuelConsumption = (prev.speed / 100) * 0.1 + (prev.engineTemp > 80 ? 0.05 : 0);
        const newFuelLevel = Math.max(0, prev.fuelLevel - fuelConsumption);

        // Engine temperature based on speed and usage
        const targetTemp = 30 + (prev.speed / 100) * 50 + (prev.hyperdriveStatus === 'charging' ? 20 : 0);
        const tempChange = (targetTemp - prev.engineTemp) * 0.1;
        const newEngineTemp = Math.max(20, Math.min(120, prev.engineTemp + tempChange));

        // Shield fluctuation
        const shieldChange = (Math.random() - 0.5) * 2;
        const newShieldStatus = Math.max(0, Math.min(100, prev.shieldStatus + shieldChange));

        // Update ETA if hyperdrive is active
        let newEta = prev.navigationComputer.eta;
        if (prev.hyperdriveStatus === 'jumping' && newEta > 0) {
          newEta = Math.max(0, newEta - 1);
        }

        return {
          ...prev,
          altitude: newAltitude,
          fuelLevel: newFuelLevel,
          engineTemp: newEngineTemp,
          shieldStatus: newShieldStatus,
          navigationComputer: {
            ...prev.navigationComputer,
            eta: newEta
          }
        };
      });
    }, 1000);

    return () => clearInterval(systemInterval);
  }, []);

  // Enable audio on first user interaction
  const enableAudio = () => {
    if (!audioEnabled) {
      setAudioEnabled(true);
      console.log('Pilot: Audio enabled');
    }
  };

  const playWeaponSound = () => {
    if (audioRef.current) {
      audioRef.current.volume = 0.5;
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
  };

  // Socket emit helper
  const emitAction = (action: string, value?: number) => {
    if (socket) {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room') || 'default';
      socket.emit('player_action', { room, action, value });
    }
  };

  // Control functions - Update local state immediately AND emit to socket
  const setSpeed = (increment: number) => {
    const newSpeed = Math.max(0, Math.min(100, pilotState.speed + increment));
    // Update local state immediately
    setPilotState(prev => ({ ...prev, speed: newSpeed }));
    // Also emit to socket
    emitAction('set_speed', newSpeed);
  };

  const bankLeft = () => {
    const newHeading = Math.max(-180, Math.min(180, pilotState.heading.x - 10));
    // Update local state immediately
    setPilotState(prev => ({
      ...prev,
      heading: { ...prev.heading, x: newHeading }
    }));
    // Also emit to socket
    emitAction('update_heading_x', newHeading);
  };

  const bankRight = () => {
    const newHeading = Math.max(-180, Math.min(180, pilotState.heading.x + 10));
    // Update local state immediately
    setPilotState(prev => ({
      ...prev,
      heading: { ...prev.heading, x: newHeading }
    }));
    // Also emit to socket
    emitAction('update_heading_x', newHeading);
  };

  const navigateTerrain = () => {
    const newHeadingX = Math.floor(Math.random() * 360) - 180;
    const newHeadingY = Math.floor(Math.random() * 180) - 90;
    // Update local state immediately
    setPilotState(prev => ({
      ...prev,
      heading: { x: newHeadingX, y: newHeadingY }
    }));
    // Also emit to socket
    emitAction('update_heading_x', newHeadingX);
    emitAction('update_heading_y', newHeadingY);
  };

  const descend = () => {
    const newHeading = Math.max(-90, Math.min(90, pilotState.heading.y - 10));
    // Update local state immediately
    setPilotState(prev => ({
      ...prev,
      heading: { ...prev.heading, y: newHeading }
    }));
    // Also emit to socket
    emitAction('update_heading_y', newHeading);
  };

  const ascend = () => {
    const newHeading = Math.max(-90, Math.min(90, pilotState.heading.y + 10));
    // Update local state immediately
    setPilotState(prev => ({
      ...prev,
      heading: { ...prev.heading, y: newHeading }
    }));
    // Also emit to socket
    emitAction('update_heading_y', newHeading);
  };

  const punchIt = () => {
    // Update local state immediately
    setPilotState(prev => ({
      ...prev,
      speed: 100,
      heading: { x: 0, y: 0 }
    }));
    // Also emit to socket
    emitAction('set_speed', 100);
    emitAction('update_heading_x', 0);
    emitAction('update_heading_y', 0);
  };

  // Advanced control functions with hypermatter consumption
  const initiateHyperdrive = () => {
    if (pilotState.hyperdriveStatus === 'ready' &&
      pilotState.fuelLevel > 20 &&
      pilotState.jumpPlanning.hypermatterRequired <= (pilotState.hypermatter?.current ?? 0)) {

      // Consume hypermatter immediately when jump starts
      const hypermatterToConsume = pilotState.jumpPlanning.hypermatterRequired;

      setPilotState(prev => ({
        ...prev,
        hyperdriveStatus: 'charging',
        hypermatter: {
          ...prev.hypermatter,
          current: Math.max(0, prev.hypermatter.current - hypermatterToConsume)
        },
        navigationComputer: {
          ...prev.navigationComputer,
          eta: Math.ceil(prev.jumpPlanning.duration * 60) // Convert hours to minutes for ETA
        }
      }));

      setTimeout(() => {
        setPilotState(prev => ({ ...prev, hyperdriveStatus: 'jumping' }));

        // Jump duration based on planned time (convert hours to seconds for simulation)
        const jumpDurationMs = pilotState.jumpPlanning.duration * 3000; // 3 seconds per hour for demo

        setTimeout(() => {
          setPilotState(prev => ({
            ...prev,
            hyperdriveStatus: 'cooldown',
            fuelLevel: Math.max(0, prev.fuelLevel - 15) // Still consume some fuel
          }));

          setTimeout(() => {
            setPilotState(prev => ({ ...prev, hyperdriveStatus: 'ready' }));
          }, 10000);
        }, jumpDurationMs);
      }, 5000);

      // Emit hyperdrive action with duration info
      emitAction('hyperdrive_jump', pilotState.jumpPlanning.duration);
    }
  };

  const toggleAutopilot = () => {
    setPilotState(prev => ({ ...prev, autopilot: !prev.autopilot }));
    emitAction('toggle_autopilot', pilotState.autopilot ? 0 : 1);
  };

  const toggleEmergencyPower = () => {
    setPilotState(prev => ({ ...prev, emergencyPower: !prev.emergencyPower }));
    emitAction('emergency_power', pilotState.emergencyPower ? 0 : 1);
  };

  const emergencyStop = () => {
    setPilotState(prev => ({
      ...prev,
      speed: 0,
      alert: 'red',
      emergencyPower: true
    }));
    emitAction('emergency_stop', 1);

    setTimeout(() => {
      setPilotState(prev => ({ ...prev, alert: 'normal' }));
    }, 5000);
  };

  const evasiveManeuvers = () => {
    const maneuvers = [
      { x: -45, y: 15, speed: 80 },
      { x: 30, y: -20, speed: 90 },
      { x: -60, y: 25, speed: 75 },
      { x: 45, y: -10, speed: 85 }
    ];

    const maneuver = maneuvers[Math.floor(Math.random() * maneuvers.length)];

    setPilotState(prev => ({
      ...prev,
      heading: { x: maneuver.x, y: maneuver.y },
      speed: maneuver.speed,
      alert: 'yellow'
    }));

    emitAction('evasive_maneuvers', 1);

    setTimeout(() => {
      setPilotState(prev => ({ ...prev, alert: 'normal' }));
    }, 3000);
  };

  // Slider handlers - Update local state immediately AND emit to socket
  const handleHeadingXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    // Update local state immediately for responsive UI
    setPilotState(prev => ({
      ...prev,
      heading: { ...prev.heading, x: value }
    }));
    // Also emit to socket for multiplayer sync
    emitAction('update_heading_x', value);
  };

  const handleHeadingYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    // Update local state immediately for responsive UI
    setPilotState(prev => ({
      ...prev,
      heading: { ...prev.heading, y: value }
    }));
    // Also emit to socket for multiplayer sync
    emitAction('update_heading_y', value);
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    // Update local state immediately for responsive UI
    setPilotState(prev => ({
      ...prev,
      speed: value
    }));
    // Also emit to socket for multiplayer sync
    emitAction('set_speed', value);
  };

  // Calculate gauge angles
  // Speed needle starts at 12 o'clock (0 degrees) and rotates 270 degrees clockwise
  const speedAngle = (pilotState.speed / 100) * 270;
  // Altitude needle also starts at 12 o'clock
  const altitudeAngle = ((pilotState.altitude % 10000) / 10000) * 270;

  return (
    <div className="cockpit-container" onClick={enableAudio}>
      {/* Video Background - Disabled due to missing file */}
      {/* 
      <video
        className="cockpit-video-background"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src="/assets/Background.mov" type="video/mp4" />
        <source src="/assets/Background.mov" type="video/quicktime" />
      </video>
      <div className="cockpit-video-overlay"></div>
      */}

      <h1 style={{
        textAlign: 'center',
        fontSize: '2.5rem',
        marginBottom: '30px',
        color: 'var(--cockpit-primary)',
        textShadow: 'var(--cockpit-text-glow) var(--cockpit-primary)',
        letterSpacing: '3px'
      }}>NAVIGATION STATION</h1>

      {/* System Status with Status Bars - Moved to top */}
      <div className="cockpit-panel">
        <h3 style={{
          textAlign: 'center',
          color: 'var(--cockpit-primary)',
          marginBottom: '20px',
          textShadow: 'var(--cockpit-text-glow) var(--cockpit-primary)'
        }}>SYSTEM STATUS</h3>

        <div style={{ display: 'grid', gap: '15px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ color: 'var(--cockpit-accent)' }}>FUEL LEVEL</span>
              <span style={{ color: 'var(--cockpit-accent)' }}>{(pilotState.fuelLevel ?? 0).toFixed(1)}%</span>
            </div>
            <div className="status-bar">
              <div
                className="status-fill fuel"
                style={{ width: `${pilotState.fuelLevel}%` }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ color: 'var(--cockpit-accent)' }}>SHIELD STATUS</span>
              <span style={{ color: 'var(--cockpit-accent)' }}>{(pilotState.shieldStatus ?? 0).toFixed(0)}%</span>
            </div>
            <div className="status-bar">
              <div
                className="status-fill shields"
                style={{ width: `${pilotState.shieldStatus}%` }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ color: 'var(--cockpit-accent)' }}>ENGINE TEMPERATURE</span>
              <span style={{ color: 'var(--cockpit-accent)' }}>{(pilotState.engineTemp ?? 0).toFixed(0)}°C</span>
            </div>
            <div className="status-bar">
              <div
                className="status-fill temperature"
                style={{ width: `${(pilotState.engineTemp / 120) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* System Status Monitoring - Moved to top */}
      <SystemStatus>
        <SystemCard status={pilotState.fuelLevel < 20 ? 'critical' : pilotState.fuelLevel < 50 ? 'warning' : 'good'}>
          <h4>Fuel Level</h4>
          <div className="system-value">{(pilotState.fuelLevel ?? 0).toFixed(1)}</div>
          <div className="system-unit">%</div>
        </SystemCard>

        <SystemCard status={pilotState.shieldStatus < 30 ? 'critical' : pilotState.shieldStatus < 60 ? 'warning' : 'good'}>
          <h4>Shield Status</h4>
          <div className="system-value">{(pilotState.shieldStatus ?? 0).toFixed(0)}</div>
          <div className="system-unit">%</div>
        </SystemCard>

        <SystemCard status={pilotState.engineTemp > 90 ? 'critical' : pilotState.engineTemp > 70 ? 'warning' : 'good'}>
          <h4>Engine Temp</h4>
          <div className="system-value">{(pilotState.engineTemp ?? 0).toFixed(0)}</div>
          <div className="system-unit">°C</div>
        </SystemCard>

        <SystemCard status={pilotState.hyperdriveStatus === 'ready' ? 'good' : 'warning'}>
          <h4>Hyperdrive</h4>
          <div className="system-value" style={{ fontSize: '1.2rem' }}>
            {(pilotState.hyperdriveStatus ?? 'ready').toUpperCase()}
          </div>
        </SystemCard>

        <SystemCard status={pilotState.hypermatter?.current < 20 ? 'critical' : pilotState.hypermatter?.current < 50 ? 'warning' : 'good'}>
          <h4>Hypermatter</h4>
          <div className="system-value">{(pilotState.hypermatter?.current ?? 0).toFixed(0)}</div>
          <div className="system-unit">tons</div>
        </SystemCard>
      </SystemStatus>

      {/* Alert Status */}
      <div style={{ position: 'absolute', left: '50px', top: '600px' }}>
        <StatusGrid>
        <StatusCard>
          <h2>ALERT STATUS</h2>
          <StatusValue alert={(pilotState.alert || 'normal').toLowerCase()}>
            {(pilotState.alert || 'NORMAL').toUpperCase()}
          </StatusValue>
          <StatusMessage alert={(pilotState.alert || 'normal').toLowerCase()}>
            {pilotState.alert === 'normal' ? 'All clear' : pilotState.alert || 'Normal'}
          </StatusMessage>
        </StatusCard>
      </StatusGrid>
      </div>

      {/* Flight Instruments */}
      <div className="instrument-grid">
        {/* Radio Altimeter */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', marginLeft: '480px' }}>
          <div style={{
            fontSize: '1.1rem',
            color: 'var(--cockpit-accent)',
            textAlign: 'center',
            fontWeight: 'bold',
            textShadow: 'var(--cockpit-text-glow) var(--cockpit-accent)'
          }}>PROXIMITY SENSOR</div>
          <div className="instrument-bezel">
            <div className="instrument-face">
              <div className="gauge-markings">
                {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((rotation, i) => (
                  <div
                    key={i}
                    className={`gauge-mark ${i % 2 === 0 ? 'major' : 'minor'}`}
                    style={{ transform: `rotate(${rotation}deg)` }}
                  />
                ))}
              </div>
              <div
                className="instrument-needle"
                style={{ transform: `rotate(${altitudeAngle}deg)` }}
              />
              <div className="digital-display" style={{
                position: 'absolute',
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '80px',
                padding: '5px'
              }}>
                <div className="digital-value" style={{ fontSize: '1.2em', margin: '0' }}>
                  {Math.round(pilotState.altitude)}
                </div>
                <div style={{ fontSize: '0.7em', color: 'var(--cockpit-primary)' }}>
                  DISTANCE<br />TO MASS (k)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Artificial Horizon */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
          <div style={{
            fontSize: '1.1rem',
            color: 'var(--cockpit-accent)',
            textAlign: 'center',
            fontWeight: 'bold',
            textShadow: 'var(--cockpit-text-glow) var(--cockpit-accent)'
          }}>ATTITUDE INDICATOR</div>
          <div className="instrument-bezel">
            <div className="artificial-horizon">
              <div className="horizon-line" />
              <div
                className="pitch-indicator"
                style={{ transform: `rotate(${-pilotState.heading.y}deg)` }}
              />
              <div
                className="roll-indicator"
                style={{ transform: `rotate(${pilotState.heading.x}deg)` }}
              />
              {/* Pitch markings */}
              {[-60, -30, -15, 0, 15, 30, 60].map((pitch, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: '20%',
                    right: '20%',
                    height: '1px',
                    background: pitch === 0 ? 'var(--cockpit-accent)' : 'var(--cockpit-primary)',
                    top: `${50 + (pitch * 0.8)}%`,
                    opacity: 0.7,
                    boxShadow: `var(--cockpit-text-glow) ${pitch === 0 ? 'var(--cockpit-accent)' : 'var(--cockpit-primary)'}`
                  }}
                />
              ))}
              {/* Center crosshair */}
              <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '40px',
                height: '2px',
                background: 'var(--cockpit-warning)',
                transform: 'translate(-50%, -50%)',
                boxShadow: 'var(--cockpit-text-glow) var(--cockpit-warning)'
              }} />
              <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '2px',
                height: '40px',
                background: 'var(--cockpit-warning)',
                transform: 'translate(-50%, -50%)',
                boxShadow: 'var(--cockpit-text-glow) var(--cockpit-warning)'
              }} />
            </div>
          </div>
        </div>

        {/* Velocity Indicator */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', marginLeft: '-480px' }}>
          <div style={{
            fontSize: '1.1rem',
            color: 'var(--cockpit-accent)',
            textAlign: 'center',
            fontWeight: 'bold',
            textShadow: 'var(--cockpit-text-glow) var(--cockpit-accent)'
          }}>VELOCITY INDICATOR</div>
          <div className="instrument-bezel">
            <div className="instrument-face">
              <div className="gauge-markings">
                {[0, 27, 54, 81, 108, 135, 162, 189, 216, 243, 270].map((rotation, i) => (
                  <div
                    key={i}
                    className={`gauge-mark ${i % 2 === 0 ? 'major' : 'minor'}`}
                    style={{ transform: `rotate(${rotation}deg)` }}
                  />
                ))}
              </div>
              <div
                className="instrument-needle"
                style={{ transform: `rotate(${speedAngle}deg)` }}
              />
              <div className="digital-display" style={{
                position: 'absolute',
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '80px',
                padding: '5px'
              }}>
                <div className="digital-value" style={{ fontSize: '1.5em', margin: '0' }}>
                  {pilotState.speed}
                </div>
                <div style={{ fontSize: '0.7em', color: 'var(--cockpit-primary)' }}>
                  (0.1c) SPEED
                </div>
              </div>
              {/* Speed markings around the dial */}
              {[0, 25, 50, 75, 100].map((speed, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '10px',
                    transform: `translateX(-50%) rotate(${(speed / 100) * 270}deg)`,
                    transformOrigin: '0 85px',
                    color: 'var(--cockpit-accent)',
                    fontSize: '0.8em',
                    fontWeight: 'bold'
                  }}
                >
                  <span style={{ transform: `rotate(${-(speed / 100) * 270}deg)`, display: 'inline-block' }}>
                    {speed}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Controls */}
      <div className="control-grid">
        {/* Combined Heading Controls */}
        <div className="cockpit-panel">
          <h3 style={{
            fontSize: '1.2em',
            color: 'var(--cockpit-primary)',
            margin: '0 0 15px 0',
            textAlign: 'center',
            textShadow: 'var(--cockpit-text-glow) var(--cockpit-primary)'
          }}>HEADING CONTROL</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* Horizontal Heading */}
            <div>
              <div className="digital-display" style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '0.8em', color: 'var(--cockpit-accent)', marginBottom: '5px' }}>
                  HORIZONTAL
                </div>
                <div className="digital-value" style={{ fontSize: '1.5em', margin: '5px 0' }}>
                  {pilotState.heading.x}°
                </div>
              </div>
              <input
                className="cockpit-slider"
                type="range"
                min="-180"
                max="180"
                step="1"
                value={pilotState.heading.x}
                onChange={handleHeadingXChange}
                style={{ width: '100%' }}
              />
            </div>

            {/* Vertical Heading */}
            <div>
              <div className="digital-display" style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '0.8em', color: 'var(--cockpit-accent)', marginBottom: '5px' }}>
                  VERTICAL
                </div>
                <div className="digital-value" style={{ fontSize: '1.5em', margin: '5px 0' }}>
                  {pilotState.heading.y}°
                </div>
              </div>
              <input
                className="cockpit-slider"
                type="range"
                min="-90"
                max="90"
                step="1"
                value={pilotState.heading.y}
                onChange={handleHeadingYChange}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Quick Heading Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
            <button className="cockpit-button" onClick={bankLeft} style={{ fontSize: '0.9em', padding: '8px' }}>
              ⬅️ LEFT
            </button>
            <button className="cockpit-button" onClick={bankRight} style={{ fontSize: '0.9em', padding: '8px' }}>
              ➡️ RIGHT
            </button>
            <button className="cockpit-button" onClick={ascend} style={{ fontSize: '0.9em', padding: '8px' }}>
              ⬆️ UP
            </button>
            <button className="cockpit-button" onClick={descend} style={{ fontSize: '0.9em', padding: '8px' }}>
              ⬇️ DOWN
            </button>
          </div>
        </div>

        {/* Asteroid Avoidance Screen */}
        <div className="cockpit-panel">
          <h3 style={{
            fontSize: '1.2em',
            color: 'var(--cockpit-primary)',
            margin: '0 0 15px 0',
            textAlign: 'center',
            textShadow: 'var(--cockpit-text-glow) var(--cockpit-primary)'
          }}>ACTUATOR</h3>

          <div style={{
            position: 'relative',
            width: '100%',
            height: '300px',
            background: '#000',
            border: '2px solid var(--cockpit-primary)',
            borderRadius: '8px',
            overflow: 'hidden',
            marginBottom: '15px'
          }}>
            <AsteroidField pilotState={pilotState} setPilotState={setPilotState} />
          </div>

          <div className="digital-display" style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '0.8em', color: 'var(--cockpit-accent)', marginBottom: '5px' }}>
              COLLISION AVOIDANCE
            </div>
            {/* <div className="digital-value" style={{ fontSize: '1.2em', margin: '5px 0' }}>
              Score: {pilotState.asteroidField.score}
            </div> */}
            <div style={{ fontSize: '0.7em', color: 'var(--cockpit-primary)' }}>
              {pilotState.asteroidField.gameActive ? 'ACTIVE - Avoid asteroids!' : ''}
            </div>
            <div style={{ fontSize: '0.6em', color: 'var(--cockpit-accent)', marginTop: '5px' }}>
              Hazard: {pilotState.asteroidField.environmentalHazard.active ?
                `${(pilotState.asteroidField?.environmentalHazard?.type ?? 'none').toUpperCase()} (${pilotState.asteroidField?.environmentalHazard?.intensity ?? ''})` :
                'None'}
            </div>
          </div>
        </div>

        <div className="cockpit-panel">
          <h3 style={{
            fontSize: '1.2em',
            color: 'var(--cockpit-primary)',
            margin: '0 0 15px 0',
            textAlign: 'center',
            textShadow: 'var(--cockpit-text-glow) var(--cockpit-primary)'
          }}>SUBLIGHT SPEED</h3>
          <div className="digital-display" style={{ marginBottom: '15px' }}>
            <div className="digital-value" style={{ fontSize: '2em', margin: '10px 0' }}>
              {pilotState.speed}
            </div>
            <div style={{ fontSize: '0.8em', color: 'var(--cockpit-secondary)' }}>
              % MAXIMUM VELOCITY
            </div>
          </div>
          <input
            className="cockpit-slider"
            type="range"
            min="0"
            max="100"
            step="1"
            value={pilotState.speed}
            onChange={handleSpeedChange}
          />
        </div>
      </div>

      {/* Navigation Computer */}
      <div className="cockpit-panel" style={{
        borderColor: 'var(--cockpit-success)',
        boxShadow: 'var(--cockpit-glow) var(--cockpit-success)'
      }}>
        <h3 style={{
          margin: '0 0 15px 0',
          color: 'var(--cockpit-success)',
          fontSize: '1.3rem',
          textAlign: 'center',
          textShadow: 'var(--cockpit-text-glow) var(--cockpit-success)'
        }}>NAVIGATION COMPUTER</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '15px',
          fontFamily: 'Share Tech Mono, monospace'
        }}>
          <div className="digital-display">
            <div style={{ fontSize: '0.9em', color: 'var(--cockpit-success)', marginBottom: '5px' }}>TARGET SYSTEM</div>
            <div style={{ fontSize: '1.2em', color: 'var(--cockpit-accent)' }}>{pilotState.navigationComputer.targetSystem}</div>
          </div>
          <div className="digital-display">
            <div style={{ fontSize: '0.9em', color: 'var(--cockpit-success)', marginBottom: '5px' }}>JUMP DISTANCE</div>
            <div style={{ fontSize: '1.2em', color: 'var(--cockpit-accent)' }}>{pilotState.navigationComputer.jumpDistance} parsecs</div>
          </div>
          <div className="digital-display">
            <div style={{ fontSize: '0.9em', color: 'var(--cockpit-success)', marginBottom: '5px' }}>CURRENT SPEED</div>
            <div style={{ fontSize: '1.2em', color: 'var(--cockpit-accent)' }}>{pilotState.speed}% sublight</div>
          </div>
          <div className="digital-display">
            <div style={{ fontSize: '0.9em', color: 'var(--cockpit-success)', marginBottom: '5px' }}>ETA</div>
            <div style={{ fontSize: '1.2em', color: 'var(--cockpit-accent)' }}>
              {pilotState.navigationComputer.eta > 0 ? `${pilotState.navigationComputer.eta}s` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Hyperdrive Panel with Hypermatter System */}
      <div className={`cockpit-panel ${pilotState.hyperdriveStatus === 'charging' ? 'hyperdrive-charging' : ''}`} style={{
        textAlign: 'center',
        borderColor: pilotState.hyperdriveStatus === 'ready' ? 'var(--cockpit-primary)' : 'var(--cockpit-warning)',
        boxShadow: `var(--cockpit-glow) ${pilotState.hyperdriveStatus === 'ready' ? 'var(--cockpit-primary)' : 'var(--cockpit-warning)'}`
      }}>
        <h3 style={{
          margin: '0 0 15px 0',
          color: 'var(--cockpit-primary)',
          fontSize: '1.4rem',
          textShadow: 'var(--cockpit-text-glow) var(--cockpit-primary)'
        }}>HYPERDRIVE SYSTEM</h3>

        {/* Hyperdrive Status */}
        <div className="digital-display" style={{ marginBottom: '20px' }}>
          <div className="digital-value" style={{ fontSize: '2.2em', margin: '10px 0' }}>
            {(pilotState.hyperdriveStatus ?? 'ready').toUpperCase()}
          </div>
        </div>

        {/* Hypermatter Status */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '15px',
          marginBottom: '20px'
        }}>
          <div className="digital-display">
            <div style={{ fontSize: '0.8em', color: 'var(--cockpit-accent)', marginBottom: '5px' }}>
              HYPERMATTER
            </div>
            <div className="digital-value" style={{
              fontSize: '1.5em',
              margin: '5px 0',
              color: (pilotState.hypermatter?.current ?? 0) < 20 ? 'var(--cockpit-danger)' :
                (pilotState.hypermatter?.current ?? 0) < 50 ? 'var(--cockpit-warning)' : 'var(--cockpit-accent)'
            }}>
              {(pilotState.hypermatter?.current ?? 0).toFixed(0)}
            </div>
            <div style={{ fontSize: '0.7em', color: 'var(--cockpit-primary)' }}>
              / {pilotState.hypermatter?.maximum ?? 80} TONS
            </div>
          </div>
          <div className="digital-display">
            <div style={{ fontSize: '0.8em', color: 'var(--cockpit-accent)', marginBottom: '5px' }}>
              CONSUMPTION
            </div>
            <div className="digital-value" style={{ fontSize: '1.5em', margin: '5px 0' }}>
              {pilotState.hypermatter.consumptionRate}
            </div>
            <div style={{ fontSize: '0.7em', color: 'var(--cockpit-primary)' }}>
              TONS/HOUR
            </div>
          </div>
        </div>

        {/* Jump Planning Interface */}
        <div style={{
          background: 'rgba(0, 40, 80, 0.3)',
          border: '1px solid var(--cockpit-secondary)',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <h4 style={{
            margin: '0 0 10px 0',
            color: 'var(--cockpit-secondary)',
            fontSize: '1.1rem'
          }}>
            JUMP PLANNING
          </h4>

          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              fontSize: '0.9em',
              color: 'var(--cockpit-accent)',
              marginBottom: '5px'
            }}>
              Target System:
            </label>
            <select
              value={pilotState.navigationComputer.targetSystem}
              onChange={(e) => {
                setPilotState(prev => ({
                  ...prev,
                  navigationComputer: {
                    ...prev.navigationComputer,
                    targetSystem: e.target.value
                  }
                }));
              }}
              style={{
                width: '100%',
                padding: '8px',
                background: '#000',
                border: '2px solid var(--cockpit-primary)',
                borderRadius: '4px',
                color: 'var(--cockpit-accent)',
                fontSize: '1.1em',
                cursor: 'pointer'
              }}
            >
              <option value="Aargonar">Aargonar</option>
              <option value="Abregado">Abregado</option>
              <option value="Aduba">Aduba</option>
              <option value="Adega">Adega</option>
              <option value="Alderaan">Alderaan</option>
              <option value="Al'har">Al'har</option>
              <option value="Altyr">Altyr</option>
              <option value="Alzoc">Alzoc</option>
              <option value="Anoat">Anoat</option>
              <option value="Axum">Axum</option>
              <option value="Bakura">Bakura</option>
              <option value="Besh Gorgon">Besh Gorgon</option>
              <option value="Bespin">Bespin</option>
              <option value="Bilbringi">Bilbringi</option>
              <option value="Bith">Bith</option>
              <option value="Bodi">Bodi</option>
              <option value="Bonadan">Bonadan</option>
              <option value="Bothawui">Bothawui</option>
              <option value="Brentaal">Brentaal</option>
              <option value="Chandrila">Chandrila</option>
              <option value="Choraxa">Choraxa</option>
              <option value="Chorios">Chorios</option>
              <option value="Cirius">Cirius</option>
              <option value="Circarpous Major">Circarpous Major</option>
              <option value="Colu">Colu</option>
              <option value="Corellian">Corellian</option>
              <option value="Corulus">Corulus</option>
              <option value="Coruscant">Coruscant</option>
              <option value="Cularin">Cularin</option>
              <option value="Cyprix">Cyprix</option>
              <option value="Dagobah">Dagobah</option>
              <option value="Dantooine">Dantooine</option>
              <option value="Dominus">Dominus</option>
              <option value="Dorvala">Dorvala</option>
              <option value="Elrood">Elrood</option>
              <option value="Empress Teta">Empress Teta</option>
              <option value="Evona/Ardos">Evona/Ardos</option>
              <option value="Endor">Endor</option>
              <option value="Falleen">Falleen</option>
              <option value="Fest">Fest</option>
              <option value="Gamorr">Gamorr</option>
              <option value="Gorsh">Gorsh</option>
              <option value="Helska">Helska</option>
              <option value="Horuset">Horuset</option>
              <option value="Hutta">Hutta</option>
              <option value="Hoth">Hoth</option>
              <option value="Iridonia">Iridonia</option>
              <option value="Japreal">Japreal</option>
              <option value="Kamino">Kamino</option>
              <option value="Korriban">Korriban</option>
              <option value="Karthakk">Karthakk</option>
              <option value="Kashyyyk">Kashyyyk</option>
              <option value="Khuiumin">Khuiumin</option>
              <option value="Kessel">Kessel</option>
              <option value="Koros">Koros</option>
              <option value="Lybeya">Lybeya</option>
              <option value="Mustafar">Mustafar</option>
              <option value="Muun">Muun</option>
              <option value="Naboo">Naboo</option>
              <option value="Onderon">Onderon</option>
              <option value="Pakunni System">Pakunni System</option>
              <option value="Polith">Polith</option>
              <option value="Polis Massa">Polis Massa</option>
              <option value="Pyria">Pyria</option>
              <option value="Pyrshak">Pyrshak</option>
              <option value="Rafa">Rafa</option>
              <option value="Riflorii">Riflorii</option>
              <option value="Rishi">Rishi</option>
              <option value="Rodia">Rodia</option>
              <option value="Rosp">Rosp</option>
              <option value="Sartinaynian">Sartinaynian</option>
              <option value="Scarl">Scarl</option>
              <option value="Serianan">Serianan</option>
              <option value="Tingel Arm">Tingel Arm</option>
              <option value="Taris">Taris</option>
              <option value="Taroon">Taroon</option>
              <option value="Tatoo">Tatoo</option>
              <option value="Telos">Telos</option>
              <option value="Teth">Teth</option>
              <option value="Utapau">Utapau</option>
              <option value="Utegetu Nebula">Utegetu Nebula</option>
              <option value="Velus">Velus</option>
              <option value="Veron">Veron</option>
              <option value="Xcorpon">Xcorpon</option>
              <option value="Yavin">Yavin</option>
              <option value="Y'Toub">Y'Toub</option>
              <option value="Zug">Zug</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              fontSize: '0.9em',
              color: 'var(--cockpit-accent)',
              marginBottom: '5px'
            }}>
              Journey Duration (Hours):
            </label>
            <input
              type="number"
              min="0.1"
              max="24"
              step="0.1"
              value={pilotState.jumpPlanning.duration}
              onChange={(e) => {
                const duration = parseFloat(e.target.value) || 0.1;
                const required = duration * pilotState.hypermatter.consumptionRate;
                const jumpDistance = duration * 0.167; // 0.167 parsecs per hour
                setPilotState(prev => ({
                  ...prev,
                  jumpPlanning: {
                    ...prev.jumpPlanning,
                    duration: duration,
                    hypermatterRequired: required
                  },
                  navigationComputer: {
                    ...prev.navigationComputer,
                    jumpDistance: jumpDistance
                  }
                }));
              }}
              style={{
                width: '100%',
                padding: '8px',
                background: '#000',
                border: '2px solid var(--cockpit-primary)',
                borderRadius: '4px',
                color: 'var(--cockpit-accent)',
                fontSize: '1.1em',
                textAlign: 'center'
              }}
            />
          </div>

          <div className="digital-display" style={{ marginBottom: '15px' }}>
            <div style={{ fontSize: '0.8em', color: 'var(--cockpit-accent)', marginBottom: '5px' }}>
              HYPERMATTER REQUIRED
            </div>
            <div className="digital-value" style={{
              fontSize: '1.8em',
              margin: '5px 0',
              color: pilotState.jumpPlanning.hypermatterRequired > pilotState.hypermatter.current ?
                'var(--cockpit-danger)' : 'var(--cockpit-success)'
            }}>
              {(pilotState.jumpPlanning?.hypermatterRequired ?? 0).toFixed(1)}
            </div>
            <div style={{ fontSize: '0.7em', color: 'var(--cockpit-primary)' }}>
              TONS
            </div>
          </div>

          {pilotState.jumpPlanning.hypermatterRequired > pilotState.hypermatter.current && (
            <div style={{
              color: 'var(--cockpit-danger)',
              fontSize: '0.9em',
              textAlign: 'center',
              marginBottom: '10px',
              fontWeight: 'bold'
            }}>
              ⚠️ INSUFFICIENT HYPERMATTER
            </div>
          )}
        </div>

        {/* Jump Button */}
        <div style={{ margin: '20px 0' }}>
          <button
            className={`cockpit-button ${pilotState.hyperdriveStatus !== 'ready' ? '' :
              pilotState.fuelLevel < 20 ? 'danger' :
                pilotState.jumpPlanning.hypermatterRequired > pilotState.hypermatter.current ? 'danger' :
                  'success'
              }`}
            onClick={initiateHyperdrive}
            disabled={
              pilotState.hyperdriveStatus !== 'ready' ||
              pilotState.fuelLevel < 20 ||
              pilotState.jumpPlanning.hypermatterRequired > pilotState.hypermatter.current
            }
            style={{
              padding: '15px 20px',
              fontSize: '1.1em',
              opacity: (
                pilotState.hyperdriveStatus !== 'ready' ||
                pilotState.fuelLevel < 20 ||
                pilotState.jumpPlanning.hypermatterRequired > pilotState.hypermatter.current
              ) ? 0.5 : 1,
              cursor: (
                pilotState.hyperdriveStatus !== 'ready' ||
                pilotState.fuelLevel < 20 ||
                pilotState.jumpPlanning.hypermatterRequired > pilotState.hypermatter.current
              ) ? 'not-allowed' : 'pointer'
            }}
          >
            {pilotState.hyperdriveStatus === 'ready' ?
              (pilotState.fuelLevel < 20 ? 'INSUFFICIENT FUEL' :
                pilotState.jumpPlanning.hypermatterRequired > pilotState.hypermatter.current ? 'INSUFFICIENT HYPERMATTER' :
                  `🚀 JUMP ${pilotState.jumpPlanning.duration}H`) :
              pilotState.hyperdriveStatus === 'charging' ? '⚡ CHARGING HYPERDRIVE...' :
                pilotState.hyperdriveStatus === 'jumping' ? '🌟 JUMPING...' :
                  '⏳ COOLDOWN'
            }
          </button>
        </div>
      </div>

      {/* Macro Buttons */}
      <div className="button-grid">
        <button className="cockpit-button" onClick={() => setSpeed(10)}>
          🚀 INCREASE SPEED
        </button>
        <button className="cockpit-button" onClick={() => setSpeed(-10)}>
          🛑 DECREASE SPEED
        </button>
        <button className="cockpit-button" onClick={bankLeft}>
          ⬅️ BANK LEFT
        </button>
        <button className="cockpit-button" onClick={bankRight}>
          ➡️ BANK RIGHT
        </button>
        <button className="cockpit-button" onClick={ascend}>
          ⬆️ ASCEND
        </button>
        <button className="cockpit-button" onClick={descend}>
          ⬇️ DESCEND
        </button>
        <button className="cockpit-button success" onClick={punchIt}>
          ⚡ PUNCH IT!
        </button>
        <button className="cockpit-button warning" onClick={evasiveManeuvers}>
          🌪️ EVASIVE MANEUVERS
        </button>
        <button className="cockpit-button danger" onClick={emergencyStop}>
          🚨 EMERGENCY STOP
        </button>
      </div>

      {/* Toggle Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '30px 0' }}>
        <button
          className={`cockpit-button ${pilotState.autopilot ? 'success' : ''}`}
          onClick={toggleAutopilot}
          style={{
            background: pilotState.autopilot ? 'var(--cockpit-success)' : undefined,
            color: pilotState.autopilot ? '#000' : undefined
          }}
        >
          🤖 AUTOPILOT: {pilotState.autopilot ? 'ON' : 'OFF'}
        </button>
        <button
          className={`cockpit-button ${pilotState.emergencyPower ? 'warning' : ''}`}
          onClick={toggleEmergencyPower}
          style={{
            background: pilotState.emergencyPower ? 'var(--cockpit-warning)' : undefined,
            color: pilotState.emergencyPower ? '#000' : undefined
          }}
        >
          ⚡ EMERGENCY POWER: {pilotState.emergencyPower ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* System Status Bars */}
      <div className="cockpit-panel">
        <h3 style={{
          textAlign: 'center',
          color: 'var(--cockpit-primary)',
          marginBottom: '20px',
          textShadow: 'var(--cockpit-text-glow) var(--cockpit-primary)'
        }}>SYSTEM STATUS</h3>

        <div style={{ display: 'grid', gap: '15px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ color: 'var(--cockpit-accent)' }}>FUEL LEVEL</span>
              <span style={{ color: 'var(--cockpit-accent)' }}>{(pilotState.fuelLevel ?? 0).toFixed(1)}%</span>
            </div>
            <div className="status-bar">
              <div
                className="status-fill fuel"
                style={{ width: `${pilotState.fuelLevel}%` }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ color: 'var(--cockpit-accent)' }}>SHIELD STATUS</span>
              <span style={{ color: 'var(--cockpit-accent)' }}>{(pilotState.shieldStatus ?? 0).toFixed(0)}%</span>
            </div>
            <div className="status-bar">
              <div
                className="status-fill shields"
                style={{ width: `${pilotState.shieldStatus}%` }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ color: 'var(--cockpit-accent)' }}>ENGINE TEMPERATURE</span>
              <span style={{ color: 'var(--cockpit-accent)' }}>{(pilotState.engineTemp ?? 0).toFixed(0)}°C</span>
            </div>
            <div className="status-bar">
              <div
                className="status-fill temperature"
                style={{ width: `${(pilotState.engineTemp / 120) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Audio element for weapon sounds */}
      <audio ref={audioRef} preload="auto">
        <source src="/sounds/weapon-fire.mp3" type="audio/mpeg" />
        <source src="/sounds/weapon-fire.ogg" type="audio/ogg" />
      </audio>
    </div>
  );
};

export default PilotStation;
