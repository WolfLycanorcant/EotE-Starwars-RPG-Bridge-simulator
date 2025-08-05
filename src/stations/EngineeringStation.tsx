import React, { useState } from 'react';
import { GameState } from '../types';

interface EngineeringStationProps {
  gameState: GameState;
  onPlayerAction: (action: string, value: any) => void;
}

const EngineeringStation: React.FC<EngineeringStationProps> = ({ gameState, onPlayerAction }) => {
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  
  // Local state for power allocations to make sliders responsive
  const [localPowerAllocations, setLocalPowerAllocations] = useState({
    weapons: 25,
    shields: 30,
    engines: 20,
    sensors: 10,
    lifeSupport: 10,
    communications: 5
  });

  // Local state for emergency power
  const [localEmergencyPower, setLocalEmergencyPower] = useState(false);

  // Mock data for demonstration
  const mockEngineering = {
    powerDistribution: {
      totalPower: 100,
      reactorOutput: 85,
      emergencyPower: false,
      batteryBackup: 75,
      powerAllocations: {
        weapons: 25,
        shields: 30,
        engines: 20,
        sensors: 10,
        lifeSupport: 10,
        communications: 5
      }
    },
    repairQueue: [],
    diagnostics: []
  };

  const mockSystems = {
    hull: { health: 85, status: 'operational' as 'operational' | 'damaged' | 'critical', temperature: 22, efficiency: 100 },
    shields: { health: 70, status: 'damaged' as 'operational' | 'damaged' | 'critical', temperature: 35, efficiency: 85 },
    weapons: { health: 90, status: 'operational' as 'operational' | 'damaged' | 'critical', temperature: 28, efficiency: 95 },
    engines: { health: 80, status: 'operational' as 'operational' | 'damaged' | 'critical', temperature: 45, efficiency: 90 },
    power: { health: 95, status: 'operational' as 'operational' | 'damaged' | 'critical', temperature: 30, efficiency: 98 },
    sensors: { health: 88, status: 'operational' as 'operational' | 'damaged' | 'critical', temperature: 25, efficiency: 92 },
    lifeSupport: { health: 92, status: 'operational' as 'operational' | 'damaged' | 'critical', temperature: 20, efficiency: 96 },
    communications: { health: 85, status: 'operational' as 'operational' | 'damaged' | 'critical', temperature: 24, efficiency: 88 }
  };

  const engineering = gameState?.engineering || mockEngineering;
  const systems = mockSystems; // Use mock systems for now

  // Power allocation logic following the HTML example
  const maxAvailablePower = localEmergencyPower ? 200 : 100; // Use local emergency power state
  const weaponsPower = localPowerAllocations.weapons;
  const shieldsPower = localPowerAllocations.shields;
  const enginesPower = localPowerAllocations.engines;
  const sensorsPower = localPowerAllocations.sensors;
  const lifeSupportPower = localPowerAllocations.lifeSupport;
  const communicationsPower = localPowerAllocations.communications;
  const totalPowerUsage = weaponsPower + shieldsPower + enginesPower + sensorsPower + lifeSupportPower + communicationsPower;
  const availablePower = maxAvailablePower - totalPowerUsage; // Available power based on GM's max setting
  const powerOverload = availablePower < 0;

  const handlePowerChange = (system: string, value: number) => {
    const currentValue = localPowerAllocations[system as keyof typeof localPowerAllocations];
    const powerDifference = value - currentValue;
    
    // If trying to increase power, check if we have enough available
    if (powerDifference > 0 && powerDifference > availablePower) {
      // Don't allow the change - not enough power available
      return;
    }
    
    // Update local state immediately for responsive UI
    setLocalPowerAllocations(prev => ({
      ...prev,
      [system]: value
    }));
    
    // Calculate new totals using the updated value
    const newAllocations = {
      ...localPowerAllocations,
      [system]: value
    };
    
    const newWeaponsPower = newAllocations.weapons || 0;
    const newShieldsPower = newAllocations.shields || 0;
    const newEnginesPower = newAllocations.engines || 0;
    const newSensorsPower = newAllocations.sensors || 0;
    const newLifeSupportPower = newAllocations.lifeSupport || 0;
    const newCommunicationsPower = newAllocations.communications || 0;
    const newTotalUsage = newWeaponsPower + newShieldsPower + newEnginesPower + newSensorsPower + newLifeSupportPower + newCommunicationsPower;
    const newAvailablePower = maxAvailablePower - newTotalUsage;
    
    // Emit power allocation to server (following HTML example)
    onPlayerAction('set_power_allocation', {
      weapons: newWeaponsPower,
      shields: newShieldsPower,
      engines: newEnginesPower,
      sensors: newSensorsPower,
      lifeSupport: newLifeSupportPower,
      communications: newCommunicationsPower,
      available: newAvailablePower,
      maxAvailable: maxAvailablePower,
      system,
      power: value
    });
  };

  const handleEmergencyPower = () => {
    const newEmergencyState = !localEmergencyPower;
    
    // Update local emergency power state immediately for responsive UI
    setLocalEmergencyPower(newEmergencyState);
    
    // Send action to server
    onPlayerAction('toggle_emergency_power', newEmergencyState);
  };

  const handleRepairSystem = (systemName: string) => {
    onPlayerAction('initiate_repair', { system: systemName, priority: 'normal' });
  };

  const containerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gridTemplateRows: '1fr 1fr',
    gap: '15px',
    padding: '15px',
    height: '100%',
    background: 'radial-gradient(circle at center, rgba(255, 170, 0, 0.05) 0%, rgba(0, 0, 0, 0.9) 100%)'
  };

  const panelStyle: React.CSSProperties = {
    background: 'rgba(20, 10, 0, 0.8)',
    border: '2px solid #ffaa00',
    borderRadius: '8px',
    padding: '15px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 0 20px rgba(255, 170, 0, 0.3)'
  };

  const panelTitleStyle: React.CSSProperties = {
    color: '#ffaa00',
    margin: '0 0 15px 0',
    textAlign: 'center',
    fontSize: '1.1rem',
    textShadow: '0 0 10px currentColor',
    letterSpacing: '2px'
  };

  const buttonStyle: React.CSSProperties = {
    background: 'rgba(255, 170, 0, 0.1)',
    border: '2px solid #ffaa00',
    color: '#ffaa00',
    padding: '8px 12px',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'all 0.3s ease',
    textTransform: 'uppercase'
  };

  return (
    <div style={containerStyle}>
      {/* Power Distribution Panel */}
      <div style={{...panelStyle, borderColor: powerOverload ? '#ff0000' : '#ffaa00'}}>
        <h3 style={{...panelTitleStyle, color: powerOverload ? '#ff0000' : '#ffaa00'}}>
          POWER DISTRIBUTION
        </h3>

        <div style={{
          background: 'rgba(0, 0, 0, 0.5)',
          border: `2px solid ${engineering.powerDistribution.reactorOutput < 50 ? '#ff0000' : '#00ff00'}`,
          borderRadius: '8px',
          padding: '10px',
          margin: '10px 0',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 'bold',
            color: engineering.powerDistribution.reactorOutput < 50 ? '#ff0000' : '#00ff00',
            marginBottom: '5px',
            textShadow: '0 0 10px currentColor'
          }}>
            {engineering.powerDistribution.emergencyPower ? 'EMERGENCY POWER' : 'REACTOR ONLINE'}
          </div>
          <div style={{
            fontSize: '18px',
            color: '#ffaa00',
            fontWeight: 'bold',
            textShadow: '0 0 15px currentColor'
          }}>
            {engineering.powerDistribution.reactorOutput}% OUTPUT
          </div>
        </div>

        {/* Total Available Power Bar - Following HTML Example */}
        <div style={{
          background: 'rgba(0, 50, 0, 0.3)',
          border: '2px solid #22b14c',
          borderRadius: '10px',
          padding: '15px',
          marginBottom: '15px'
        }}>
          <h4 style={{ color: '#22b14c', margin: '0 0 10px 0', fontSize: '14px' }}>POWER ALLOCATION</h4>
          <div style={{
            width: '100%',
            height: '30px',
            background: '#333',
            borderRadius: '15px',
            overflow: 'hidden',
            position: 'relative',
            margin: '10px 0'
          }}>
            <div style={{
              height: '100%',
              background: availablePower < 0 ? '#dc3545' : 
                         availablePower < (maxAvailablePower * 0.2) ? 'orange' : 
                         'linear-gradient(90deg, #22b14c, #007bff)',
              transition: 'width 0.3s ease',
              width: Math.max(0, (availablePower / maxAvailablePower) * 100) + '%'
            }}></div>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontWeight: 'bold',
              color: availablePower < 0 ? '#dc3545' : 
                     availablePower < (maxAvailablePower * 0.2) ? 'orange' : 
                     'white',
              textShadow: '1px 1px 2px black',
              fontSize: '12px'
            }}>
              {availablePower}% Available (Max: {maxAvailablePower}%)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, maxHeight: '200px', overflowY: 'auto' }}>
          {Object.entries(localPowerAllocations).map(([systemName, power]) => (
            <div key={systemName} style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(0, 0, 0, 0.6)',
              border: `1px solid ${power > 80 ? '#ff0000' : '#664400'}`,
              borderRadius: '4px',
              padding: '10px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
                fontSize: '12px',
                color: '#ffaa00',
                fontWeight: 'bold'
              }}>
                <span>{systemName.toUpperCase()}</span>
                <span>{power}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={power}
                onChange={(e) => handlePowerChange(systemName, parseInt(e.target.value))}
                style={{
                  width: '100%',
                  height: '8px',
                  background: '#221100',
                  borderRadius: '4px',
                  outline: 'none',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  cursor: 'pointer'
                }}
                className="power-slider"
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '15px' }}>
          <button
            style={{...buttonStyle, 
              background: localEmergencyPower ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 136, 0, 0.1)',
              borderColor: localEmergencyPower ? '#00ff00' : '#ff8800',
              color: localEmergencyPower ? '#00ff00' : '#ff8800'
            }}
            onClick={handleEmergencyPower}
          >
            {localEmergencyPower ? 'EMERGENCY ON' : 'EMERGENCY PWR'}
          </button>
          <button style={{...buttonStyle, background: 'rgba(255, 0, 0, 0.1)', borderColor: '#ff0000', color: '#ff0000'}}>
            SHUTDOWN
          </button>
        </div>
      </div>

      {/* System Status Panel */}
      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>SYSTEM STATUS</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
          {Object.entries(systems).map(([systemName, system]) => (
            <div key={systemName} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 60px 80px 60px',
              gap: '10px',
              alignItems: 'center',
              background: 'rgba(0, 0, 0, 0.4)',
              border: `1px solid ${
                system.status === 'critical' ? '#ff0000' :
                system.status === 'damaged' ? '#ff8800' :
                '#00ff00'
              }`,
              borderRadius: '4px',
              padding: '8px',
              fontSize: '11px'
            }}>
              <div style={{ color: '#ffaa00', fontWeight: 'bold' }}>
                {systemName.toUpperCase()}
              </div>
              <div style={{ 
                color: system.status === 'critical' ? '#ff0000' :
                       system.status === 'damaged' ? '#ff8800' :
                       '#00ff00',
                textAlign: 'center',
                fontWeight: 'bold'
              }}>
                {system.health}%
              </div>
              <div style={{ 
                color: system.status === 'critical' ? '#ff0000' :
                       system.status === 'damaged' ? '#ff8800' :
                       '#00ff00',
                textAlign: 'center',
                fontSize: '10px',
                textTransform: 'uppercase'
              }}>
                {system.status}
              </div>
              <div style={{ 
                color: system.status === 'critical' ? '#ff0000' : '#ffaa00',
                textAlign: 'center',
                fontSize: '10px'
              }}>
                {system.temperature}°C
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Damage Control & Repair Operations Panel */}
      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>DAMAGE CONTROL & REPAIR</h3>

        <div style={{ fontSize: '11px', marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Hull Integrity:</span>
            <span style={{ color: systems.hull.health > 50 ? '#00ff00' : '#ff0000' }}>
              {systems.hull.health}%
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Shield Status:</span>
            <span style={{ color: systems.shields.health > 50 ? '#00ff00' : '#ff8800' }}>
              {systems.shields.status.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Life Support:</span>
            <span style={{ color: systems.lifeSupport.health > 75 ? '#00ff00' : '#ff0000' }}>
              {systems.lifeSupport.health > 75 ? 'STABLE' : 'CRITICAL'}
            </span>
          </div>
        </div>

        <div style={{ flex: 1, marginBottom: '15px' }}>
          {engineering.repairQueue.length === 0 ? (
            <div style={{ color: '#888888', textAlign: 'center', fontSize: '10px' }}>
              No active repair operations
            </div>
          ) : (
            <div>Repair queue would be displayed here</div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button style={{...buttonStyle, background: 'rgba(255, 136, 0, 0.1)', borderColor: '#ff8800', color: '#ff8800'}} onClick={() => handleRepairSystem('hull')}>
            REPAIR HULL
          </button>
          <button style={{...buttonStyle, background: 'rgba(255, 136, 0, 0.1)', borderColor: '#ff8800', color: '#ff8800'}} onClick={() => handleRepairSystem('shields')}>
            REPAIR SHIELDS
          </button>
          <button style={buttonStyle} onClick={() => handleRepairSystem('weapons')}>
            REPAIR WEAPONS
          </button>
          <button style={buttonStyle} onClick={() => handleRepairSystem('engines')}>
            REPAIR ENGINES
          </button>
          <button style={{...buttonStyle, background: 'rgba(255, 0, 0, 0.1)', borderColor: '#ff0000', color: '#ff0000'}} onClick={() => onPlayerAction('seal_hull_breach', {})}>
            SEAL BREACH
          </button>
          <button style={{...buttonStyle, background: 'rgba(255, 136, 0, 0.1)', borderColor: '#ff8800', color: '#ff8800'}} onClick={() => onPlayerAction('reroute_power', { emergency: true })}>
            REROUTE PWR
          </button>
        </div>
      </div>

      {/* System Diagnostics Panel */}
      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>SYSTEM DIAGNOSTICS</h3>

        <div style={{ 
          flex: 1, 
          background: 'rgba(0, 0, 0, 0.6)', 
          border: '1px solid #664400', 
          borderRadius: '4px', 
          padding: '10px', 
          overflowY: 'auto', 
          fontSize: '11px', 
          maxHeight: '300px' 
        }}>
          <div style={{ color: '#00ff00', textAlign: 'center', marginTop: '50px' }}>
            ALL SYSTEMS NOMINAL
            <br />
            <span style={{ fontSize: '10px', color: '#888888' }}>
              No diagnostic alerts
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '15px' }}>
          <button style={buttonStyle} onClick={() => onPlayerAction('run_diagnostics', { full: true })}>
            FULL SCAN
          </button>
          <button style={buttonStyle} onClick={() => onPlayerAction('clear_diagnostics', {})}>
            CLEAR LOG
          </button>
        </div>
      </div>

      {/* Astrogation Course Plotting Panel */}
      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>ASTROGATION</h3>

        <div style={{ fontSize: '11px', marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Current Position:</span>
            <span style={{ color: '#00ff00' }}>
              CORUSCANT SYSTEM
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Hyperdrive Status:</span>
            <span style={{ color: '#00ff00' }}>
              READY
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Nav Computer:</span>
            <span style={{ color: '#ffaa00' }}>
              CALCULATING
            </span>
          </div>
        </div>

        <div style={{ 
          flex: 1, 
          background: 'rgba(0, 0, 0, 0.6)', 
          border: '1px solid #664400', 
          borderRadius: '4px', 
          padding: '10px', 
          marginBottom: '15px',
          minHeight: '120px'
        }}>
          <div style={{ color: '#ffaa00', marginBottom: '10px', fontWeight: 'bold', fontSize: '10px' }}>
            COURSE PLOTTING:
          </div>
          <div style={{ color: '#00ff00', fontSize: '10px', marginBottom: '5px' }}>
            → Destination: TATOOINE SYSTEM
          </div>
          <div style={{ color: '#ffaa00', fontSize: '10px', marginBottom: '5px' }}>
            → Distance: 12,847 parsecs
          </div>
          <div style={{ color: '#ffaa00', fontSize: '10px', marginBottom: '5px' }}>
            → Travel Time: 4.2 standard hours
          </div>
          <div style={{ color: '#ff8800', fontSize: '10px' }}>
            → Hazards: Imperial patrol routes
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button style={{...buttonStyle, background: 'rgba(0, 255, 0, 0.1)', borderColor: '#00ff00', color: '#00ff00'}} onClick={() => onPlayerAction('plot_course', { destination: 'selected' })}>
            PLOT COURSE
          </button>
          <button style={{...buttonStyle, background: 'rgba(0, 136, 255, 0.1)', borderColor: '#0088ff', color: '#0088ff'}} onClick={() => onPlayerAction('engage_hyperdrive', {})}>
            ENGAGE
          </button>
          <button style={buttonStyle} onClick={() => onPlayerAction('update_nav_data', {})}>
            UPDATE NAV
          </button>
          <button style={{...buttonStyle, background: 'rgba(255, 136, 0, 0.1)', borderColor: '#ff8800', color: '#ff8800'}} onClick={() => onPlayerAction('emergency_jump', {})}>
            EMRG JUMP
          </button>
        </div>
      </div>

      {/* Environmental Systems Panel */}
      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>ENVIRONMENTAL</h3>

        <div style={{ fontSize: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0' }}>
            <div style={{ width: '100px', fontSize: '11px', color: '#888888' }}>ATMOSPHERE</div>
            <div style={{ flex: 1, height: '12px', background: '#001100', border: '1px solid #004400', borderRadius: '6px', position: 'relative', overflow: 'hidden', margin: '0 10px' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #00ff00, #ffff00, #ff0000)', transition: 'width 0.3s ease', width: systems.lifeSupport.efficiency + '%' }}></div>
            </div>
            <div style={{ width: '50px', textAlign: 'right', fontSize: '11px', color: '#ffaa00', fontWeight: 'bold' }}>{systems.lifeSupport.efficiency}%</div>
          </div>

          <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(0, 0, 0, 0.5)', borderRadius: '4px' }}>
            <div style={{ color: '#ffaa00', marginBottom: '8px', fontWeight: 'bold' }}>
              ENVIRONMENTAL STATUS:
            </div>
            <div style={{ color: systems.lifeSupport.status === 'operational' ? '#00ff00' : '#ff8800' }}>
              Life Support: {systems.lifeSupport.status.toUpperCase()}
            </div>
            <div style={{ color: '#00ff00' }}>
              Artificial Gravity: NOMINAL
            </div>
            <div style={{ color: '#00ff00' }}>
              Atmospheric Pressure: NORMAL
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '15px' }}>
          <button style={buttonStyle} onClick={() => onPlayerAction('adjust_life_support', { level: 'high' })}>
            BOOST O2
          </button>
          <button style={buttonStyle} onClick={() => onPlayerAction('emergency_lighting', {})}>
            EMRG LIGHTS
          </button>
        </div>
      </div>
    </div>
  );
};

export default EngineeringStation;