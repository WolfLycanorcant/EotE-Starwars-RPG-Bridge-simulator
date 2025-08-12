import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { GameState, RepairTask, SystemBoost, SystemStatus } from '../types';

// Local interface for the complete engineering state
interface EngineeringState {
    powerDistribution: {
        totalPower: number;
        reactorOutput: number;
        emergencyPower: boolean;
        powerAllocations: {
            weapons: number;
            shields: number;
            engines: number;
            sensors: number;
            lifeSupport: number;
            communications: number;
        };
    };
    systemStatus: {
        [systemName: string]: SystemStatus;
    };
    repairQueue: RepairTask[];
    activeBoosts: SystemBoost[];
    emergencyProcedures: {
        emergencyPowerActive: boolean;
        emergencyShutdownActive: boolean;
        lifeSupportPriority: boolean;
    };
}

interface EngineeringStationProps {
    gameState: GameState;
    onPlayerAction: (action: string, value: any) => void;
    socket: Socket | null;
}

const EngineeringStation: React.FC<EngineeringStationProps> = ({ gameState, onPlayerAction, socket }) => {
    // Add CSS animations for visual effects
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes criticalPulse {
                0%, 100% { 
                    box-shadow: 0 0 30px rgba(255, 68, 68, 0.6),
                               inset 0 1px 0 rgba(255, 68, 68, 0.3),
                               inset 0 -1px 0 rgba(255, 68, 68, 0.2);
                    border-color: #ff4444;
                }
                50% { 
                    box-shadow: 0 0 50px rgba(255, 68, 68, 0.9),
                               inset 0 1px 0 rgba(255, 68, 68, 0.5),
                               inset 0 -1px 0 rgba(255, 68, 68, 0.4);
                    border-color: #ff6666;
                }
            }
            
            @keyframes warningGlow {
                0%, 100% { 
                    box-shadow: 0 0 25px rgba(255, 170, 68, 0.5),
                               inset 0 1px 0 rgba(255, 170, 68, 0.25),
                               inset 0 -1px 0 rgba(255, 170, 68, 0.15);
                }
                50% { 
                    box-shadow: 0 0 35px rgba(255, 170, 68, 0.7),
                               inset 0 1px 0 rgba(255, 170, 68, 0.35),
                               inset 0 -1px 0 rgba(255, 170, 68, 0.25);
                }
            }
            
            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0.3; }
            }
            
            @keyframes slideIn {
                from { 
                    opacity: 0; 
                    transform: translateY(-10px); 
                }
                to { 
                    opacity: 1; 
                    transform: translateY(0); 
                }
            }
            
            @keyframes powerFlow {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
            
            @keyframes scanPulse {
                0%, 100% { opacity: 0.7; }
                50% { opacity: 1; }
            }
            
            .engineering-panel {
                animation: slideIn 0.5s ease-out;
            }
            
            .power-flow {
                background: linear-gradient(90deg, 
                    transparent 0%, 
                    rgba(255, 140, 0, 0.3) 25%, 
                    rgba(255, 140, 0, 0.6) 50%, 
                    rgba(255, 140, 0, 0.3) 75%, 
                    transparent 100%);
                background-size: 200% 100%;
                animation: powerFlow 2s linear infinite;
            }
            
            .scanning-effect {
                animation: scanPulse 1.5s ease-in-out infinite;
            }
        `;
        document.head.appendChild(style);

        return () => {
            document.head.removeChild(style);
        };
    }, []);

    // Power history tracking
    const [powerHistory, setPowerHistory] = useState<Array<{ timestamp: number; allocations: typeof engineeringState.powerDistribution.powerAllocations }>>([]);

    // Droid management state
    const [availableDroids, setAvailableDroids] = useState<number>(20);

    // Ship strain management state
    const [shipStrain, setShipStrain] = useState<{ current: number; maximum: number }>({
        current: 0,
        maximum: 100
    });

    // Initialize engineering state with default values
    const [engineeringState, setEngineeringState] = useState<EngineeringState>({
        powerDistribution: {
            totalPower: 600,
            reactorOutput: 600,
            emergencyPower: false,
            powerAllocations: {
                weapons: 100,
                shields: 150,
                engines: 120,
                sensors: 90,
                lifeSupport: 90,
                communications: 50,
            },
        },
        systemStatus: {
            weapons: { health: 100, efficiency: 100, strain: 0, damaged: false, criticalDamage: false },
            shields: { health: 100, efficiency: 100, strain: 0, damaged: false, criticalDamage: false },
            engines: { health: 100, efficiency: 100, strain: 0, damaged: false, criticalDamage: false },
            sensors: { health: 100, efficiency: 100, strain: 0, damaged: false, criticalDamage: false },
            lifeSupport: { health: 100, efficiency: 100, strain: 0, damaged: false, criticalDamage: false },
            communications: { health: 100, efficiency: 100, strain: 0, damaged: false, criticalDamage: false },
        },
        repairQueue: [],
        activeBoosts: [],
        emergencyProcedures: {
            emergencyPowerActive: false,
            emergencyShutdownActive: false,
            lifeSupportPriority: false,
        },
    });

    // Power calculation functions
    const calculateTotalAvailablePower = (): number => {
        const basePower = engineeringState.powerDistribution.reactorOutput;
        const emergencyBonus = engineeringState.powerDistribution.emergencyPower ? 100 : 0;
        return basePower + emergencyBonus;
    };

    const calculateTotalAllocatedPower = (): number => {
        const allocations = engineeringState.powerDistribution.powerAllocations;
        return Object.values(allocations).reduce((total, allocation) => total + allocation, 0);
    };

    const calculateSystemRequirements = (systemName: string): { minimum: number; optimal: number } => {
        const systemStatus = engineeringState.systemStatus[systemName];
        const baseRequirement = 15; // Base power requirement for all systems

        // Damaged systems require more power for same output
        const damageMultiplier = systemStatus?.damaged ? 1.5 : 1.0;
        const criticalMultiplier = systemStatus?.criticalDamage ? 2.0 : 1.0;

        const minimum = Math.round(baseRequirement * damageMultiplier * criticalMultiplier * 0.6);
        const optimal = Math.round(baseRequirement * damageMultiplier * criticalMultiplier);

        return { minimum, optimal };
    };

    // Power allocation validation
    const validatePowerAllocation = (systemName: string, newValue: number): boolean => {
        const currentAllocations = { ...engineeringState.powerDistribution.powerAllocations };
        currentAllocations[systemName as keyof typeof currentAllocations] = newValue;

        const totalAllocated = Object.values(currentAllocations).reduce((total, allocation) => total + allocation, 0);
        const totalAvailable = calculateTotalAvailablePower();

        return totalAllocated <= totalAvailable;
    };

    // Power efficiency calculation based on system damage
    const calculatePowerEfficiency = (systemName: string, allocatedPower: number): number => {
        const systemStatus = engineeringState.systemStatus[systemName];
        const baseEfficiency = systemStatus?.efficiency || 100;

        // Damaged systems are less power efficient
        const damageEfficiencyPenalty = systemStatus?.damaged ? 0.8 : 1.0;
        const criticalEfficiencyPenalty = systemStatus?.criticalDamage ? 0.5 : 1.0;

        // Calculate effective power output
        const effectivePower = allocatedPower * (baseEfficiency / 100) * damageEfficiencyPenalty * criticalEfficiencyPenalty;

        return Math.round(effectivePower);
    };

    // Helper function to emit state updates to GM station
    const emitStateUpdate = (updatedState?: Partial<EngineeringState>) => {
        if (socket) {
            const currentState = updatedState || engineeringState;
            socket.emit('state_update', {
                station: 'engineering',
                state: {
                    powerDistribution: currentState.powerDistribution || engineeringState.powerDistribution,
                    systemStatus: currentState.systemStatus || engineeringState.systemStatus,
                    repairQueue: currentState.repairQueue || engineeringState.repairQueue,
                    activeBoosts: currentState.activeBoosts || engineeringState.activeBoosts,
                    emergencyProcedures: currentState.emergencyProcedures || engineeringState.emergencyProcedures
                }
            });
        }
    };

    // Power allocation update function
    const updatePowerAllocation = (systemName: string, newValue: number) => {
        if (!validatePowerAllocation(systemName, newValue)) {
            console.warn(`⚠️ Power allocation rejected: Would exceed total available power`);
            return;
        }

        const newAllocations = {
            ...engineeringState.powerDistribution.powerAllocations,
            [systemName]: newValue
        };

        const updatedPowerDistribution = {
            ...engineeringState.powerDistribution,
            powerAllocations: newAllocations
        };

        setEngineeringState(prev => ({
            ...prev,
            powerDistribution: updatedPowerDistribution
        }));

        // Add to power history (keep last 20 entries)
        setPowerHistory(prev => {
            const newEntry = {
                timestamp: Date.now(),
                allocations: newAllocations
            };
            const updatedHistory = [...prev, newEntry].slice(-20);
            return updatedHistory;
        });

        // Calculate effective power for the system
        const effectivePower = calculatePowerEfficiency(systemName, newValue);

        // Emit power change to other stations with efficiency data
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'power_allocation_change',
                system: systemName,
                value: newValue,
                effectivePower: effectivePower,
                totalAllocated: Object.values(newAllocations).reduce((total, allocation) => total + allocation, 0),
                efficiency: calculatePowerEfficiency(systemName, newValue) / newValue * 100
            });

            // Emit state update for GM station
            emitStateUpdate({
                powerDistribution: updatedPowerDistribution,
                systemStatus: engineeringState.systemStatus,
                repairQueue: engineeringState.repairQueue,
                activeBoosts: engineeringState.activeBoosts,
                emergencyProcedures: engineeringState.emergencyProcedures
            });
        }

        console.log(`⚡ Power allocation updated: ${systemName} = ${newValue}% (${effectivePower}% effective)`);
    };

    // System health tracking functions
    const classifyDamageSeverity = (health: number): 'none' | 'minor' | 'major' | 'critical' => {
        if (health >= 80) return 'none';
        if (health >= 60) return 'minor';
        if (health >= 30) return 'major';
        return 'critical';
    };

    const updateSystemDamageStatus = (systemName: string, health: number) => {
        const severity = classifyDamageSeverity(health);
        const damaged = health < 80;
        const criticalDamage = health < 30;

        setEngineeringState(prev => ({
            ...prev,
            systemStatus: {
                ...prev.systemStatus,
                [systemName]: {
                    ...prev.systemStatus[systemName],
                    health: health,
                    damaged: damaged,
                    criticalDamage: criticalDamage,
                    // Efficiency decreases with damage
                    efficiency: Math.max(20, Math.round(health * 0.8 + 20)),
                    // Strain increases with damage
                    strain: Math.max(0, Math.round((100 - health) * 0.5))
                }
            }
        }));

        console.log(`🔧 System ${systemName} damage updated: ${health}% health (${severity} damage)`);
    };

    const simulateSystemDegradation = () => {
        // Simulate gradual system degradation over time
        setEngineeringState(prev => {
            const updatedSystemStatus = { ...prev.systemStatus };

            Object.keys(updatedSystemStatus).forEach(systemName => {
                const system = updatedSystemStatus[systemName];

                // Systems gradually accumulate strain from use
                if (system.strain < 100) {
                    const strainIncrease = Math.random() * 0.5; // Random strain accumulation
                    updatedSystemStatus[systemName] = {
                        ...system,
                        strain: Math.min(100, system.strain + strainIncrease)
                    };
                }

                // High strain can cause efficiency loss
                if (system.strain > 70) {
                    const efficiencyLoss = (system.strain - 70) * 0.1;
                    updatedSystemStatus[systemName] = {
                        ...updatedSystemStatus[systemName],
                        efficiency: Math.max(20, system.efficiency - efficiencyLoss)
                    };
                }

                // Critical strain can cause health damage
                if (system.strain > 90 && Math.random() < 0.01) {
                    const healthLoss = Math.random() * 2;
                    const newHealth = Math.max(0, system.health - healthLoss);
                    const severity = classifyDamageSeverity(newHealth);

                    updatedSystemStatus[systemName] = {
                        ...updatedSystemStatus[systemName],
                        health: newHealth,
                        damaged: newHealth < 80,
                        criticalDamage: newHealth < 30
                    };

                    console.log(`⚠️ System ${systemName} suffered strain damage: ${newHealth.toFixed(1)}% health (${severity})`);
                }
            });

            return {
                ...prev,
                systemStatus: updatedSystemStatus
            };
        });
    };

    const getSystemStatusColor = (system: SystemStatus): string => {
        if (system.criticalDamage) return '#ff4444'; // Red for critical
        if (system.damaged) return '#ffaa44'; // Orange for damaged
        if (system.strain > 70) return '#ffff44'; // Yellow for high strain
        return '#44ff44'; // Green for healthy
    };

    const getSystemAlertLevel = (system: SystemStatus): 'none' | 'warning' | 'critical' => {
        if (system.criticalDamage || system.health < 20) return 'critical';
        if (system.damaged || system.strain > 80 || system.efficiency < 50) return 'warning';
        return 'none';
    };

    // Repair queue management functions
    const generateRepairTaskId = (): string => {
        return `repair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    };

    const calculateRepairDifficulty = (systemName: string, damageType: 'minor' | 'major' | 'critical'): number => {
        const baseDifficulty = {
            minor: 2,
            major: 3,
            critical: 4
        };

        // Some systems are inherently more complex to repair
        const systemComplexity = {
            weapons: 1.2,
            shields: 1.1,
            engines: 1.3,
            sensors: 1.0,
            lifeSupport: 1.4,
            communications: 0.9
        };

        const complexity = systemComplexity[systemName as keyof typeof systemComplexity] || 1.0;
        return Math.round(baseDifficulty[damageType] * complexity);
    };

    const calculateRepairTime = (damageType: 'minor' | 'major' | 'critical', assignedDroids: number): number => {
        const baseTime = {
            minor: 30,    // 30 seconds
            major: 90,    // 1.5 minutes
            critical: 180 // 3 minutes
        };

        // More droids reduces repair time (diminishing returns)
        const droidEfficiency = Math.min(2.0, 1 + (assignedDroids - 1) * 0.3);
        return Math.round(baseTime[damageType] / droidEfficiency);
    };

    const createRepairTask = (systemName: string, damageType: 'minor' | 'major' | 'critical', assignedDroids: number = 1): RepairTask => {
        const difficulty = calculateRepairDifficulty(systemName, damageType);
        const timeRequired = calculateRepairTime(damageType, assignedDroids);

        return {
            id: generateRepairTaskId(),
            systemName,
            damageType,
            difficulty,
            timeRequired,
            progress: 0,
            assignedCrew: assignedDroids,
            juryRigged: false
        };
    };

    const addRepairTask = (systemName: string, damageType: 'minor' | 'major' | 'critical', assignedDroids: number = 1) => {
        // Check if there's already a repair task for this system
        const existingTask = engineeringState.repairQueue.find(task => task.systemName === systemName);
        if (existingTask) {
            console.warn(`⚠️ Repair task already exists for ${systemName}`);
            return;
        }

        const newTask = createRepairTask(systemName, damageType, assignedDroids);

        setEngineeringState(prev => ({
            ...prev,
            repairQueue: [...prev.repairQueue, newTask].sort((a, b) => {
                // Sort by priority: critical > major > minor
                const priorityOrder = { critical: 3, major: 2, minor: 1 };
                return priorityOrder[b.damageType] - priorityOrder[a.damageType];
            })
        }));

        // Emit repair task creation
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'repair_task_created',
                task: newTask
            });
        }

        console.log(`🔧 Repair task created for ${systemName}: ${damageType} damage (${assignedDroids} droids assigned)`);
    };

    const updateRepairTaskDroids = (taskId: string, newDroidCount: number) => {
        setEngineeringState(prev => ({
            ...prev,
            repairQueue: prev.repairQueue.map(task => {
                if (task.id === taskId) {
                    const updatedTimeRequired = calculateRepairTime(task.damageType, newDroidCount);
                    return {
                        ...task,
                        assignedCrew: newDroidCount,
                        timeRequired: updatedTimeRequired
                    };
                }
                return task;
            })
        }));

        console.log(`🤖 Repair task ${taskId} droids updated to ${newDroidCount}`);
    };

    const removeRepairTask = (taskId: string) => {
        setEngineeringState(prev => ({
            ...prev,
            repairQueue: prev.repairQueue.filter(task => task.id !== taskId)
        }));

        console.log(`🗑️ Repair task ${taskId} removed from queue`);
    };

    const assessSystemDamage = (systemName: string): { needsRepair: boolean; damageType: 'minor' | 'major' | 'critical' | null } => {
        const system = engineeringState.systemStatus[systemName];

        if (!system.damaged) {
            return { needsRepair: false, damageType: null };
        }

        const severity = classifyDamageSeverity(system.health);

        if (severity === 'none') {
            return { needsRepair: false, damageType: null };
        }

        return {
            needsRepair: true,
            damageType: severity as 'minor' | 'major' | 'critical'
        };
    };

    const prioritizeRepairTasks = (): string[] => {
        // Return system names in order of repair priority
        const damagedSystems = Object.entries(engineeringState.systemStatus)
            .filter(([, status]) => status.damaged)
            .map(([name, status]) => ({
                name,
                severity: classifyDamageSeverity(status.health),
                health: status.health
            }))
            .sort((a, b) => {
                // First sort by severity (critical > major > minor)
                const severityOrder = { critical: 3, major: 2, minor: 1, none: 0 };
                const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];

                if (severityDiff !== 0) return severityDiff;

                // Then sort by health (lower health = higher priority)
                return a.health - b.health;
            });

        return damagedSystems.map(system => system.name);
    };

    // Repair mechanics implementation
    const performSkillCheck = (difficulty: number): { success: boolean; quality: 'failure' | 'success' | 'advantage' | 'triumph' } => {
        // Simulate Edge of the Empire dice mechanics
        const roll = Math.random();
        const skillBonus = 0.1; // Base skill level bonus
        const adjustedRoll = roll + skillBonus;

        // Difficulty thresholds
        const difficultyThreshold = 0.3 + (difficulty * 0.15);

        if (adjustedRoll >= difficultyThreshold + 0.3) {
            return { success: true, quality: 'triumph' }; // Exceptional success
        } else if (adjustedRoll >= difficultyThreshold + 0.15) {
            return { success: true, quality: 'advantage' }; // Success with advantage
        } else if (adjustedRoll >= difficultyThreshold) {
            return { success: true, quality: 'success' }; // Basic success
        } else {
            return { success: false, quality: 'failure' }; // Failure
        }
    };

    const calculateRepairEffectiveness = (quality: 'failure' | 'success' | 'advantage' | 'triumph', juryRigged: boolean): number => {
        const baseEffectiveness = {
            failure: 0,
            success: 1.0,
            advantage: 1.3,
            triumph: 1.6
        };

        const effectiveness = baseEffectiveness[quality];

        // Jury-rigged repairs are less effective but faster
        return juryRigged ? effectiveness * 0.7 : effectiveness;
    };

    const processRepairAttempt = (taskId: string) => {
        const task = engineeringState.repairQueue.find(t => t.id === taskId);
        if (!task) return;

        const skillCheck = performSkillCheck(task.difficulty);
        const effectiveness = calculateRepairEffectiveness(skillCheck.quality, task.juryRigged);

        // Calculate progress increment based on droid team size and effectiveness
        const baseProgress = (100 / (task.timeRequired / 10)) * task.assignedCrew; // Progress per 10-second interval
        const actualProgress = baseProgress * effectiveness;

        setEngineeringState(prev => ({
            ...prev,
            repairQueue: prev.repairQueue.map(repairTask => {
                if (repairTask.id === taskId) {
                    const newProgress = Math.min(100, repairTask.progress + actualProgress);
                    return { ...repairTask, progress: newProgress };
                }
                return repairTask;
            })
        }));

        // Log repair attempt result
        console.log(`🔧 Repair attempt on ${task.systemName}: ${skillCheck.quality} (${actualProgress.toFixed(1)}% progress)`);

        // Check if repair is complete
        const updatedTask = { ...task, progress: Math.min(100, task.progress + actualProgress) };
        if (updatedTask.progress >= 100) {
            completeRepair(taskId, skillCheck.quality, task.juryRigged);
        }
    };

    const completeRepair = (taskId: string, quality: 'failure' | 'success' | 'advantage' | 'triumph', juryRigged: boolean) => {
        const task = engineeringState.repairQueue.find(t => t.id === taskId);
        if (!task) return;

        // Calculate health restoration based on repair quality
        const healthRestoration = {
            failure: 0,
            success: juryRigged ? 15 : 25,
            advantage: juryRigged ? 20 : 35,
            triumph: juryRigged ? 25 : 50
        };

        const healthGain = healthRestoration[quality];
        const systemName = task.systemName;

        setEngineeringState(prev => {
            const currentSystem = prev.systemStatus[systemName];
            const newHealth = Math.min(100, currentSystem.health + healthGain);
            const newDamaged = newHealth < 80;
            const newCriticalDamage = newHealth < 30;

            // Update system status
            const updatedSystemStatus = {
                ...prev.systemStatus,
                [systemName]: {
                    ...currentSystem,
                    health: newHealth,
                    damaged: newDamaged,
                    criticalDamage: newCriticalDamage,
                    efficiency: Math.max(20, Math.round(newHealth * 0.8 + 20)),
                    strain: Math.max(0, Math.round((100 - newHealth) * 0.5)),
                    repairProgress: undefined // Clear repair progress
                }
            };

            // Remove completed repair task
            const updatedRepairQueue = prev.repairQueue.filter(t => t.id !== taskId);

            return {
                ...prev,
                systemStatus: updatedSystemStatus,
                repairQueue: updatedRepairQueue
            };
        });

        // Emit repair completion
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'repair_completed',
                system: systemName,
                quality: quality,
                healthGain: healthGain,
                juryRigged: juryRigged
            });
        }

        console.log(`✅ Repair completed on ${systemName}: ${quality} quality (+${healthGain} health)${juryRigged ? ' [JURY-RIGGED]' : ''}`);
    };

    const preventCascadingFailure = (systemName: string) => {
        // Prevent damage from spreading to connected systems
        const connectedSystems = {
            weapons: ['sensors'],
            shields: ['engines'],
            engines: ['lifeSupport'],
            sensors: ['communications'],
            lifeSupport: ['communications'],
            communications: []
        };

        const connected = connectedSystems[systemName as keyof typeof connectedSystems] || [];

        connected.forEach(connectedSystemName => {
            const connectedSystem = engineeringState.systemStatus[connectedSystemName];
            if (connectedSystem && connectedSystem.health > 50) {
                // Apply minor strain to connected systems
                setEngineeringState(prev => ({
                    ...prev,
                    systemStatus: {
                        ...prev.systemStatus,
                        [connectedSystemName]: {
                            ...connectedSystem,
                            strain: Math.min(100, connectedSystem.strain + 5)
                        }
                    }
                }));

                console.log(`⚠️ Cascading effect: ${connectedSystemName} strain increased due to ${systemName} failure`);
            }
        });
    };

    // Repair progress simulation (runs periodically)
    useEffect(() => {
        const repairInterval = setInterval(() => {
            if (engineeringState.repairQueue.length > 0) {
                engineeringState.repairQueue.forEach(task => {
                    if (task.progress < 100) {
                        processRepairAttempt(task.id);
                    }
                });
            }
        }, 10000); // Process repairs every 10 seconds

        return () => clearInterval(repairInterval);
    }, [engineeringState.repairQueue]);

    // System boost mechanics implementation
    const generateBoostId = (): string => {
        return `boost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    };

    const calculateBoostStrainCost = (systemName: string, boostType: 'performance' | 'efficiency' | 'output', magnitude: number): number => {
        const baseStrainCost = {
            performance: 15,
            efficiency: 10,
            output: 20
        };

        // System complexity affects strain cost
        const systemComplexity = {
            weapons: 1.2,
            shields: 1.1,
            engines: 1.3,
            sensors: 1.0,
            lifeSupport: 1.4,
            communications: 0.9
        };

        const complexity = systemComplexity[systemName as keyof typeof systemComplexity] || 1.0;
        const magnitudeMultiplier = 1 + (magnitude - 1) * 0.5; // Higher magnitude = more strain

        return Math.round(baseStrainCost[boostType] * complexity * magnitudeMultiplier);
    };

    const calculateBoostDuration = (boostType: 'performance' | 'efficiency' | 'output', magnitude: number): number => {
        const baseDuration = {
            performance: 120, // 2 minutes
            efficiency: 180,  // 3 minutes
            output: 90        // 1.5 minutes
        };

        // Higher magnitude boosts last shorter
        const magnitudePenalty = 1 - (magnitude - 1) * 0.2;
        return Math.round(baseDuration[boostType] * magnitudePenalty);
    };

    const createSystemBoost = (systemName: string, boostType: 'performance' | 'efficiency' | 'output', magnitude: number): SystemBoost => {
        const strainCost = calculateBoostStrainCost(systemName, boostType, magnitude);
        const duration = calculateBoostDuration(boostType, magnitude);

        return {
            id: generateBoostId(),
            systemName,
            boostType,
            magnitude,
            duration,
            strainCost,
            timeRemaining: duration
        };
    };

    const canApplyBoost = (systemName: string, boostType: 'performance' | 'efficiency' | 'output', magnitude: number): { canApply: boolean; reason?: string } => {
        const system = engineeringState.systemStatus[systemName];

        // Check if system is critically damaged
        if (system.criticalDamage) {
            return { canApply: false, reason: 'System critically damaged' };
        }

        // Check if system already has this type of boost
        const existingBoost = engineeringState.activeBoosts.find(boost =>
            boost.systemName === systemName && boost.boostType === boostType
        );
        if (existingBoost) {
            return { canApply: false, reason: 'Boost already active' };
        }

        // Check strain limits
        const strainCost = calculateBoostStrainCost(systemName, boostType, magnitude);
        if (system.strain + strainCost > 95) {
            return { canApply: false, reason: 'Would exceed strain limits' };
        }

        return { canApply: true };
    };

    const applySystemBoost = (systemName: string, boostType: 'performance' | 'efficiency' | 'output', magnitude: number) => {
        const canApply = canApplyBoost(systemName, boostType, magnitude);
        if (!canApply.canApply) {
            console.warn(`⚠️ Cannot apply boost to ${systemName}: ${canApply.reason}`);
            return;
        }

        const newBoost = createSystemBoost(systemName, boostType, magnitude);

        setEngineeringState(prev => {
            // Add strain to the system
            const updatedSystemStatus = {
                ...prev.systemStatus,
                [systemName]: {
                    ...prev.systemStatus[systemName],
                    strain: Math.min(100, prev.systemStatus[systemName].strain + newBoost.strainCost)
                }
            };

            return {
                ...prev,
                systemStatus: updatedSystemStatus,
                activeBoosts: [...prev.activeBoosts, newBoost]
            };
        });

        // Emit boost activation
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'system_boost_activated',
                boost: newBoost
            });
        }

        console.log(`🚀 System boost activated: ${systemName} ${boostType} +${magnitude} (${newBoost.strainCost} strain)`);
    };

    const removeSystemBoost = (boostId: string) => {
        const boost = engineeringState.activeBoosts.find(b => b.id === boostId);
        if (!boost) return;

        setEngineeringState(prev => ({
            ...prev,
            activeBoosts: prev.activeBoosts.filter(b => b.id !== boostId)
        }));

        // Emit boost deactivation
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'system_boost_deactivated',
                boostId: boostId,
                systemName: boost.systemName
            });
        }

        console.log(`⏹️ System boost expired: ${boost.systemName} ${boost.boostType}`);
    };

    const calculateBoostEffects = (systemName: string): { performanceBonus: number; efficiencyBonus: number; outputBonus: number } => {
        const systemBoosts = engineeringState.activeBoosts.filter(boost => boost.systemName === systemName);

        let performanceBonus = 0;
        let efficiencyBonus = 0;
        let outputBonus = 0;

        systemBoosts.forEach(boost => {
            switch (boost.boostType) {
                case 'performance':
                    performanceBonus += boost.magnitude * 10; // 10% per magnitude level
                    break;
                case 'efficiency':
                    efficiencyBonus += boost.magnitude * 15; // 15% per magnitude level
                    break;
                case 'output':
                    outputBonus += boost.magnitude * 20; // 20% per magnitude level
                    break;
            }
        });

        return { performanceBonus, efficiencyBonus, outputBonus };
    };

    const getAvailableBoosts = (systemName: string): Array<{ boostType: 'performance' | 'efficiency' | 'output'; magnitude: number; canApply: boolean; reason?: string }> => {
        const boostTypes: Array<'performance' | 'efficiency' | 'output'> = ['performance', 'efficiency', 'output'];
        const magnitudes = [1, 2, 3]; // Boost levels

        const availableBoosts: Array<{ boostType: 'performance' | 'efficiency' | 'output'; magnitude: number; canApply: boolean; reason?: string }> = [];

        boostTypes.forEach(boostType => {
            magnitudes.forEach(magnitude => {
                const canApply = canApplyBoost(systemName, boostType, magnitude);
                availableBoosts.push({
                    boostType,
                    magnitude,
                    canApply: canApply.canApply,
                    reason: canApply.reason
                });
            });
        });

        return availableBoosts;
    };

    // Boost duration tracking (runs periodically)
    useEffect(() => {
        const boostInterval = setInterval(() => {
            if (engineeringState.activeBoosts.length > 0) {
                setEngineeringState(prev => {
                    const updatedBoosts = prev.activeBoosts.map(boost => ({
                        ...boost,
                        timeRemaining: Math.max(0, boost.timeRemaining - 1)
                    }));

                    // Remove expired boosts
                    const expiredBoosts = updatedBoosts.filter(boost => boost.timeRemaining <= 0);
                    const activeBoosts = updatedBoosts.filter(boost => boost.timeRemaining > 0);

                    // Log expired boosts
                    expiredBoosts.forEach(boost => {
                        console.log(`⏰ Boost expired: ${boost.systemName} ${boost.boostType}`);
                    });

                    return {
                        ...prev,
                        activeBoosts: activeBoosts
                    };
                });
            }
        }, 1000); // Update every second

        return () => clearInterval(boostInterval);
    }, [engineeringState.activeBoosts]);

    // Emergency procedures implementation
    const activateEmergencyShutdown = (systemName: string) => {
        // Emergency shutdown for critically damaged systems
        setEngineeringState(prev => {
            const updatedSystemStatus = {
                ...prev.systemStatus,
                [systemName]: {
                    ...prev.systemStatus[systemName],
                    strain: 0, // Reset strain
                    efficiency: 0 // System offline
                }
            };

            // Set power allocation to 0 for shutdown system
            const updatedPowerAllocations = {
                ...prev.powerDistribution.powerAllocations,
                [systemName]: 0
            };

            return {
                ...prev,
                systemStatus: updatedSystemStatus,
                powerDistribution: {
                    ...prev.powerDistribution,
                    powerAllocations: updatedPowerAllocations
                },
                emergencyProcedures: {
                    ...prev.emergencyProcedures,
                    emergencyShutdownActive: true
                }
            };
        });

        // Emit emergency shutdown
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'emergency_shutdown',
                system: systemName
            });
        }

        console.log(`🚨 Emergency shutdown activated for ${systemName}`);
    };

    const activateLifeSupportPriority = () => {
        const newPriorityState = !engineeringState.emergencyProcedures.lifeSupportPriority;

        setEngineeringState(prev => {
            let updatedPowerAllocations = { ...prev.powerDistribution.powerAllocations };

            if (newPriorityState) {
                // Redirect power to life support
                const totalAvailable = calculateTotalAvailablePower();
                const lifeSupportPriority = Math.min(40, totalAvailable * 0.4); // 40% of available power
                const remainingPower = totalAvailable - lifeSupportPriority;
                const otherSystems = Object.keys(updatedPowerAllocations).filter(sys => sys !== 'lifeSupport');
                const powerPerSystem = Math.floor(remainingPower / otherSystems.length);

                updatedPowerAllocations.lifeSupport = lifeSupportPriority;
                otherSystems.forEach(system => {
                    updatedPowerAllocations[system as keyof typeof updatedPowerAllocations] = powerPerSystem;
                });
            }

            return {
                ...prev,
                powerDistribution: {
                    ...prev.powerDistribution,
                    powerAllocations: updatedPowerAllocations
                },
                emergencyProcedures: {
                    ...prev.emergencyProcedures,
                    lifeSupportPriority: newPriorityState
                }
            };
        });

        // Emit life support priority change
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'life_support_priority',
                value: newPriorityState
            });
        }

        console.log(`🚨 Life support priority ${newPriorityState ? 'ACTIVATED' : 'DEACTIVATED'}`);
    };

    const performEmergencyRepair = (systemName: string) => {
        // Emergency repair: faster but less effective than normal repairs
        const system = engineeringState.systemStatus[systemName];
        const damageAssessment = assessSystemDamage(systemName);

        if (!damageAssessment.needsRepair) {
            console.warn(`⚠️ ${systemName} does not need emergency repair`);
            return;
        }

        // Check if there's already a repair task
        const existingTask = engineeringState.repairQueue.find(task => task.systemName === systemName);
        if (existingTask) {
            // Convert existing repair to emergency repair (jury-rigged)
            setEngineeringState(prev => ({
                ...prev,
                repairQueue: prev.repairQueue.map(task =>
                    task.systemName === systemName
                        ? { ...task, juryRigged: true, timeRequired: Math.round(task.timeRequired * 0.3) }
                        : task
                )
            }));
        } else {
            // Create new emergency repair task
            const emergencyTask = createRepairTask(systemName, damageAssessment.damageType!, 2); // 2 droids assigned
            emergencyTask.juryRigged = true;
            emergencyTask.timeRequired = Math.round(emergencyTask.timeRequired * 0.3); // 30% of normal time

            setEngineeringState(prev => ({
                ...prev,
                repairQueue: [...prev.repairQueue, emergencyTask].sort((a, b) => {
                    const priorityOrder = { critical: 3, major: 2, minor: 1 };
                    return priorityOrder[b.damageType] - priorityOrder[a.damageType];
                })
            }));
        }

        // Emit emergency repair
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'emergency_repair',
                system: systemName
            });
        }

        console.log(`🚨 Emergency repair initiated for ${systemName}`);
    };

    const activateEmergencyProtocols = () => {
        // Activate all emergency procedures at once
        const criticalSystems = Object.entries(engineeringState.systemStatus)
            .filter(([, status]) => status.criticalDamage)
            .map(([name]) => name);

        // Activate emergency power
        if (!engineeringState.powerDistribution.emergencyPower) {
            toggleEmergencyPower();
        }

        // Activate life support priority
        if (!engineeringState.emergencyProcedures.lifeSupportPriority) {
            activateLifeSupportPriority();
        }

        // Start emergency repairs on all critical systems
        criticalSystems.forEach(systemName => {
            performEmergencyRepair(systemName);
        });

        // Emit emergency protocols activation
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'emergency_protocols_activated',
                criticalSystems: criticalSystems
            });
        }

        console.log(`🚨 Emergency protocols activated for ${criticalSystems.length} critical systems`);
    };

    const deactivateAllEmergencyProcedures = () => {
        setEngineeringState(prev => ({
            ...prev,
            emergencyProcedures: {
                emergencyPowerActive: false,
                emergencyShutdownActive: false,
                lifeSupportPriority: false
            },
            powerDistribution: {
                ...prev.powerDistribution,
                emergencyPower: false,
                totalPower: prev.powerDistribution.reactorOutput
            }
        }));

        // Emit emergency deactivation
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'emergency_procedures_deactivated'
            });
        }

        console.log(`🚨 All emergency procedures deactivated`);
    };

    const getEmergencyStatus = (): { level: 'green' | 'yellow' | 'red'; criticalSystems: string[]; warnings: string[] } => {
        const criticalSystems = Object.entries(engineeringState.systemStatus)
            .filter(([, status]) => status.criticalDamage)
            .map(([name]) => name);

        const warningSystems = Object.entries(engineeringState.systemStatus)
            .filter(([, status]) => status.damaged && !status.criticalDamage)
            .map(([name]) => name);

        const highStrainSystems = Object.entries(engineeringState.systemStatus)
            .filter(([, status]) => status.strain > 80)
            .map(([name]) => name);

        const warnings: string[] = [];
        if (highStrainSystems.length > 0) {
            warnings.push(`High strain: ${highStrainSystems.join(', ')}`);
        }
        if (calculateTotalAllocatedPower() > calculateTotalAvailablePower()) {
            warnings.push('Power overallocation detected');
        }

        let level: 'green' | 'yellow' | 'red' = 'green';
        if (criticalSystems.length > 0) {
            level = 'red';
        } else if (warningSystems.length > 2 || highStrainSystems.length > 1) {
            level = 'yellow';
        }

        return { level, criticalSystems, warnings };
    };

    // GM Integration and Scenario Support
    const handleGMSystemDamage = (damageData: { system: string; damage: number; type?: string }) => {
        const { system, damage, type } = damageData;

        if (!engineeringState.systemStatus[system]) {
            console.warn(`⚠️ GM damage event for unknown system: ${system}`);
            return;
        }

        const currentHealth = engineeringState.systemStatus[system].health;
        const newHealth = Math.max(0, currentHealth - damage);

        updateSystemDamageStatus(system, newHealth);

        // Trigger cascading failure prevention
        if (newHealth < 30) {
            preventCascadingFailure(system);
        }

        // Emit performance tracking
        if (socket) {
            socket.emit('engineering_performance', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'gm_damage_received',
                system: system,
                damage: damage,
                newHealth: newHealth,
                responseTime: Date.now()
            });
        }

        console.log(`🎯 GM Event: ${system} took ${damage} damage (${type || 'unspecified'}) - Health: ${newHealth.toFixed(1)}%`);
    };

    const handleGMSystemMalfunction = (malfunctionData: { system: string; type: 'power_surge' | 'efficiency_loss' | 'strain_buildup'; severity: number }) => {
        const { system, type, severity } = malfunctionData;

        if (!engineeringState.systemStatus[system]) {
            console.warn(`⚠️ GM malfunction event for unknown system: ${system}`);
            return;
        }

        setEngineeringState(prev => {
            const currentSystem = prev.systemStatus[system];
            let updatedSystem = { ...currentSystem };

            switch (type) {
                case 'power_surge':
                    updatedSystem.strain = Math.min(100, currentSystem.strain + severity);
                    break;
                case 'efficiency_loss':
                    updatedSystem.efficiency = Math.max(20, currentSystem.efficiency - severity);
                    break;
                case 'strain_buildup':
                    updatedSystem.strain = Math.min(100, currentSystem.strain + severity * 2);
                    break;
            }

            return {
                ...prev,
                systemStatus: {
                    ...prev.systemStatus,
                    [system]: updatedSystem
                }
            };
        });

        console.log(`🎯 GM Event: ${system} malfunction - ${type} (severity: ${severity})`);
    };

    const handleGMPowerUpdate = (powerData: { reactorOutput?: number; emergencyPower?: boolean; systemPowerLoss?: string }) => {
        setEngineeringState(prev => {
            let updatedPowerDistribution = { ...prev.powerDistribution };

            if (powerData.reactorOutput !== undefined) {
                updatedPowerDistribution.reactorOutput = Math.max(0, Math.min(100, powerData.reactorOutput));
                updatedPowerDistribution.totalPower = calculateTotalAvailablePower();
            }

            if (powerData.emergencyPower !== undefined) {
                updatedPowerDistribution.emergencyPower = powerData.emergencyPower;
                updatedPowerDistribution.totalPower = calculateTotalAvailablePower();
            }

            if (powerData.systemPowerLoss) {
                const system = powerData.systemPowerLoss;
                updatedPowerDistribution.powerAllocations = {
                    ...updatedPowerDistribution.powerAllocations,
                    [system]: 0
                };
            }

            return {
                ...prev,
                powerDistribution: updatedPowerDistribution
            };
        });

        console.log(`🎯 GM Event: Power system update`, powerData);
    };

    const handleReactorOutputChange = (newOutput: number) => {
        // Validate reactor output range (0-100% normal operation)
        const clampedOutput = Math.max(0, Math.min(100, newOutput));

        setEngineeringState(prev => {
            const updatedPowerDistribution = {
                ...prev.powerDistribution,
                reactorOutput: clampedOutput,
                totalPower: clampedOutput + (prev.powerDistribution.emergencyPower ? 100 : 0)
            };

            return {
                ...prev,
                powerDistribution: updatedPowerDistribution
            };
        });

        // Emit reactor output change to other stations
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'reactor_output_change',
                value: clampedOutput,
                totalPower: clampedOutput + (engineeringState.powerDistribution.emergencyPower ? 100 : 0)
            });

            // Emit state update so GM station can sync its UI
            emitStateUpdate({
                powerDistribution: {
                    ...engineeringState.powerDistribution,
                    reactorOutput: clampedOutput,
                    totalPower: clampedOutput + (engineeringState.powerDistribution.emergencyPower ? 100 : 0)
                },
                systemStatus: engineeringState.systemStatus,
                repairQueue: engineeringState.repairQueue,
                activeBoosts: engineeringState.activeBoosts,
                emergencyProcedures: engineeringState.emergencyProcedures
            });
        }

        console.log(`⚡ Reactor output changed by GM: ${clampedOutput}%`);

        // Add visual feedback
        addErrorMessage(`Reactor output set to ${clampedOutput}%${clampedOutput > 100 ? ' [OVERLOAD]' : ''}`,
            clampedOutput > 100 ? 'warning' : 'info');
    };

    const handleGMReactorFluctuation = (fluctuationData: { intensity: number; duration: number }) => {
        const { intensity, duration } = fluctuationData;

        // Temporarily reduce reactor output
        const originalOutput = engineeringState.powerDistribution.reactorOutput;
        const fluctuationOutput = Math.max(20, originalOutput - intensity);

        setEngineeringState(prev => ({
            ...prev,
            powerDistribution: {
                ...prev.powerDistribution,
                reactorOutput: fluctuationOutput,
                totalPower: fluctuationOutput + (prev.powerDistribution.emergencyPower ? 100 : 0)
            }
        }));

        // Restore reactor output after duration
        setTimeout(() => {
            setEngineeringState(prev => ({
                ...prev,
                powerDistribution: {
                    ...prev.powerDistribution,
                    reactorOutput: originalOutput,
                    totalPower: originalOutput + (prev.powerDistribution.emergencyPower ? 100 : 0)
                }
            }));
            console.log(`🎯 GM Event: Reactor fluctuation ended - Output restored to ${originalOutput}%`);
        }, duration * 1000);

        console.log(`🎯 GM Event: Reactor fluctuation - Output reduced to ${fluctuationOutput}% for ${duration}s`);
    };

    const handleGMEmergencyScenario = (scenarioData: { type: 'cascade_failure' | 'power_crisis' | 'system_overload'; systems: string[]; severity: number }) => {
        const { type, systems, severity } = scenarioData;

        switch (type) {
            case 'cascade_failure':
                systems.forEach(systemName => {
                    if (engineeringState.systemStatus[systemName]) {
                        const damage = severity * 10; // Convert severity to damage
                        handleGMSystemDamage({ system: systemName, damage, type: 'cascade_failure' });
                    }
                });
                break;

            case 'power_crisis':
                setEngineeringState(prev => ({
                    ...prev,
                    powerDistribution: {
                        ...prev.powerDistribution,
                        reactorOutput: Math.max(30, prev.powerDistribution.reactorOutput - severity * 5),
                        totalPower: Math.max(30, prev.powerDistribution.reactorOutput - severity * 5)
                    }
                }));
                break;

            case 'system_overload':
                systems.forEach(systemName => {
                    if (engineeringState.systemStatus[systemName]) {
                        handleGMSystemMalfunction({
                            system: systemName,
                            type: 'strain_buildup',
                            severity: severity * 5
                        });
                    }
                });
                break;
        }

        console.log(`🎯 GM Event: Emergency scenario - ${type} affecting ${systems.join(', ')} (severity: ${severity})`);
    };

    const handleGMSystemConfiguration = (configData: { system?: string; globalSettings?: any; difficultyModifier?: number }) => {
        // Handle GM configuration changes for system parameters
        if (configData.difficultyModifier !== undefined) {
            // Adjust repair difficulty globally
            console.log(`🎯 GM Config: Difficulty modifier set to ${configData.difficultyModifier}`);
        }

        if (configData.globalSettings) {
            // Handle global engineering settings
            console.log(`🎯 GM Config: Global settings updated`, configData.globalSettings);
        }

        console.log(`🎯 GM Event: System configuration update`, configData);
    };

    const handleGMRandomEvent = (eventData: { type: string; description: string; effects: any }) => {
        const { type, description, effects } = eventData;

        // Handle various random engineering events
        switch (type) {
            case 'solar_flare':
                // Increase strain on all systems
                setEngineeringState(prev => {
                    const updatedSystemStatus = { ...prev.systemStatus };
                    Object.keys(updatedSystemStatus).forEach(systemName => {
                        updatedSystemStatus[systemName] = {
                            ...updatedSystemStatus[systemName],
                            strain: Math.min(100, updatedSystemStatus[systemName].strain + 10)
                        };
                    });
                    return { ...prev, systemStatus: updatedSystemStatus };
                });
                break;

            case 'power_fluctuation':
                // Random power allocation changes
                const randomSystem = Object.keys(engineeringState.powerDistribution.powerAllocations)[
                    Math.floor(Math.random() * Object.keys(engineeringState.powerDistribution.powerAllocations).length)
                ];
                const fluctuation = (Math.random() - 0.5) * 10; // ±5 power units
                updatePowerAllocation(randomSystem, Math.max(0, Math.min(50,
                    engineeringState.powerDistribution.powerAllocations[randomSystem as keyof typeof engineeringState.powerDistribution.powerAllocations] + fluctuation
                )));
                break;

            case 'system_glitch':
                // Temporary efficiency loss
                if (effects.system && engineeringState.systemStatus[effects.system]) {
                    handleGMSystemMalfunction({
                        system: effects.system,
                        type: 'efficiency_loss',
                        severity: effects.severity || 15
                    });
                }
                break;
        }

        console.log(`🎯 GM Event: Random event - ${type}: ${description}`);
    };

    const handleGMSystemRepair = (repairData: { system: string; amount: number }) => {
        const { system, amount } = repairData;

        if (system === 'all') {
            // Repair all systems
            setEngineeringState(prev => {
                const updatedSystemStatus = { ...prev.systemStatus };

                Object.keys(updatedSystemStatus).forEach(systemName => {
                    const currentSystem = updatedSystemStatus[systemName];
                    const newHealth = Math.min(100, currentSystem.health + amount);

                    updatedSystemStatus[systemName] = {
                        ...currentSystem,
                        health: newHealth,
                        damaged: newHealth < 80,
                        criticalDamage: newHealth < 30,
                        efficiency: Math.max(20, Math.round(newHealth * 0.8 + 20)),
                        strain: Math.max(0, Math.round((100 - newHealth) * 0.5))
                    };
                });

                return {
                    ...prev,
                    systemStatus: updatedSystemStatus
                };
            });

            console.log(`🔧 GM Event: All systems repaired (+${amount}% health)`);
            addErrorMessage(`All systems repaired: +${amount}% health`, 'info');
        } else {
            // Repair specific system
            setEngineeringState(prev => {
                const currentSystem = prev.systemStatus[system];
                if (!currentSystem) return prev;

                const newHealth = Math.min(100, currentSystem.health + amount);

                return {
                    ...prev,
                    systemStatus: {
                        ...prev.systemStatus,
                        [system]: {
                            ...currentSystem,
                            health: newHealth,
                            damaged: newHealth < 80,
                            criticalDamage: newHealth < 30,
                            efficiency: Math.max(20, Math.round(newHealth * 0.8 + 20)),
                            strain: Math.max(0, Math.round((100 - newHealth) * 0.5))
                        }
                    }
                };
            });

            console.log(`🔧 GM Event: ${system} repaired (+${amount}% health)`);
            addErrorMessage(`${system} system repaired: +${amount}% health`, 'info');
        }

        // Emit state update
        emitStateUpdate();
    };

    const handleGMDroidAllocation = (allocationData: { availableDroids: number }) => {
        const { availableDroids: newDroidCount } = allocationData;

        // Update available droids
        setAvailableDroids(newDroidCount);

        // If we now have fewer droids than are currently assigned, we need to adjust repair tasks
        const totalAssignedDroids = engineeringState.repairQueue.reduce((sum, task) => sum + task.assignedCrew, 0);

        if (totalAssignedDroids > newDroidCount) {
            // Need to reduce droid assignments to fit within new limit
            setEngineeringState(prev => {
                const updatedRepairQueue = [...prev.repairQueue];
                let remainingDroids = newDroidCount;

                // Prioritize critical repairs first
                updatedRepairQueue.sort((a, b) => {
                    const priorityOrder = { critical: 3, major: 2, minor: 1 };
                    return priorityOrder[b.damageType] - priorityOrder[a.damageType];
                });

                // Reassign droids based on priority
                updatedRepairQueue.forEach(task => {
                    const droidsNeeded = Math.min(task.assignedCrew, remainingDroids);
                    task.assignedCrew = Math.max(1, droidsNeeded); // Minimum 1 droid per task
                    task.timeRequired = calculateRepairTime(task.damageType, task.assignedCrew);
                    remainingDroids -= task.assignedCrew;
                });

                // Remove tasks that can't be assigned any droids (if we're at 0 droids)
                const finalRepairQueue = newDroidCount > 0 ? updatedRepairQueue : [];

                return {
                    ...prev,
                    repairQueue: finalRepairQueue
                };
            });

            addErrorMessage(`Droid allocation reduced to ${newDroidCount}. Repair assignments adjusted.`, 'warning');
        } else {
            addErrorMessage(`Droid allocation updated: ${newDroidCount} droids available`, 'info');
        }

        console.log(`🤖 GM Event: Droid allocation changed to ${newDroidCount} droids`);

        // Emit state update to GM
        emitStateUpdate();
    };

    const handleGMShipStrainUpdate = (strainData: { current: number; maximum: number }) => {
        const { current, maximum } = strainData;

        // Update the ship strain state
        setShipStrain({
            current: current,
            maximum: maximum
        });

        console.log(`🎯 GM Event: Ship strain updated - Current: ${current}, Max: ${maximum}`);
        addErrorMessage(`Ship strain set to ${current}/${maximum}`, current > 70 ? 'warning' : 'info');

        // Emit state update to GM
        emitStateUpdate();
    };

    // Performance tracking for GM feedback
    const trackEngineeringPerformance = () => {
        const performance = {
            timestamp: Date.now(),
            systemsOperational: Object.values(engineeringState.systemStatus).filter(s => !s.damaged).length,
            totalSystems: Object.keys(engineeringState.systemStatus).length,
            averageHealth: Object.values(engineeringState.systemStatus).reduce((sum, s) => sum + s.health, 0) / Object.keys(engineeringState.systemStatus).length,
            averageStrain: Object.values(engineeringState.systemStatus).reduce((sum, s) => sum + s.strain, 0) / Object.keys(engineeringState.systemStatus).length,
            powerEfficiency: (calculateTotalAllocatedPower() / calculateTotalAvailablePower()) * 100,
            activeRepairs: engineeringState.repairQueue.length,
            activeBoosts: engineeringState.activeBoosts.length,
            emergencyProceduresActive: Object.values(engineeringState.emergencyProcedures).filter(Boolean).length
        };

        // Emit performance data to GM
        if (socket) {
            socket.emit('engineering_performance', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'performance_update',
                performance: performance
            });
        }

        return performance;
    };

    // Random event system
    const [randomEventsEnabled, setRandomEventsEnabled] = useState(false);

    useEffect(() => {
        if (!randomEventsEnabled) return;

        const randomEventInterval = setInterval(() => {
            // 5% chance per minute for a random event
            if (Math.random() < 0.05) {
                const events = [
                    { type: 'minor_fluctuation', description: 'Minor power fluctuation detected' },
                    { type: 'strain_buildup', description: 'System strain accumulation' },
                    { type: 'efficiency_drift', description: 'System efficiency degradation' }
                ];

                const randomEvent = events[Math.floor(Math.random() * events.length)];
                handleGMRandomEvent({
                    type: randomEvent.type,
                    description: randomEvent.description,
                    effects: { severity: Math.random() * 10 + 5 }
                });
            }
        }, 60000); // Check every minute

        return () => clearInterval(randomEventInterval);
    }, [randomEventsEnabled]);

    // Performance tracking interval
    useEffect(() => {
        const performanceInterval = setInterval(() => {
            trackEngineeringPerformance();
        }, 30000); // Track performance every 30 seconds

        return () => clearInterval(performanceInterval);
    }, [engineeringState]);

    // Diagnostics and Monitoring Tools
    const [diagnosticScans, setDiagnosticScans] = useState<{ [systemName: string]: { progress: number; results?: any; scanning: boolean } }>({});
    const [performanceHistory, setPerformanceHistory] = useState<Array<{ timestamp: number; systemName: string; health: number; efficiency: number; strain: number }>>([]);
    const [predictiveAlerts, setPredictiveAlerts] = useState<Array<{ id: string; systemName: string; type: string; severity: 'low' | 'medium' | 'high'; message: string; timestamp: number }>>([]);

    const performSystemScan = (systemName: string, scanType: 'basic' | 'deep' | 'comprehensive' = 'basic') => {
        if (diagnosticScans[systemName]?.scanning) {
            console.warn(`⚠️ System scan already in progress for ${systemName}`);
            return;
        }

        const scanDuration = {
            basic: 15,      // 15 seconds
            deep: 45,       // 45 seconds
            comprehensive: 90 // 90 seconds
        };

        setDiagnosticScans(prev => ({
            ...prev,
            [systemName]: {
                progress: 0,
                scanning: true,
                results: undefined
            }
        }));

        // Simulate scan progress
        const scanInterval = setInterval(() => {
            setDiagnosticScans(prev => {
                const currentScan = prev[systemName];
                if (!currentScan || !currentScan.scanning) {
                    clearInterval(scanInterval);
                    return prev;
                }

                const newProgress = Math.min(100, currentScan.progress + (100 / scanDuration[scanType]));

                if (newProgress >= 100) {
                    clearInterval(scanInterval);
                    const scanResults = generateScanResults(systemName, scanType);

                    return {
                        ...prev,
                        [systemName]: {
                            progress: 100,
                            scanning: false,
                            results: scanResults
                        }
                    };
                }

                return {
                    ...prev,
                    [systemName]: {
                        ...currentScan,
                        progress: newProgress
                    }
                };
            });
        }, 1000);

        console.log(`🔍 Starting ${scanType} diagnostic scan on ${systemName}`);
    };

    const generateScanResults = (systemName: string, scanType: 'basic' | 'deep' | 'comprehensive') => {
        const system = engineeringState.systemStatus[systemName];
        const baseResults = {
            timestamp: Date.now(),
            scanType: scanType,
            systemName: systemName,
            overallStatus: system.health > 80 ? 'optimal' : system.health > 50 ? 'degraded' : 'critical',
            health: system.health,
            efficiency: system.efficiency,
            strain: system.strain
        };

        const detailedResults = {
            ...baseResults,
            components: {
                primarySystems: Math.max(0, system.health - Math.random() * 10),
                secondarySystems: Math.max(0, system.health - Math.random() * 15),
                powerCouplings: Math.max(0, 100 - system.strain - Math.random() * 20),
                thermalRegulation: Math.max(0, system.efficiency - Math.random() * 10)
            },
            recommendations: generateScanRecommendations(system),
            predictedFailures: generateFailurePredictions(system),
            maintenanceSchedule: generateMaintenanceSchedule(system)
        };

        switch (scanType) {
            case 'basic':
                return baseResults;
            case 'deep':
                return { ...baseResults, components: detailedResults.components, recommendations: detailedResults.recommendations };
            case 'comprehensive':
                return detailedResults;
            default:
                return baseResults;
        }
    };

    const generateScanRecommendations = (system: SystemStatus): string[] => {
        const recommendations: string[] = [];

        if (system.health < 80) {
            recommendations.push('Schedule maintenance to restore system health');
        }
        if (system.strain > 70) {
            recommendations.push('Reduce system load to prevent strain damage');
        }
        if (system.efficiency < 80) {
            recommendations.push('Perform calibration to improve efficiency');
        }
        if (system.damaged) {
            recommendations.push('Initiate repair procedures immediately');
        }
        if (system.criticalDamage) {
            recommendations.push('URGENT: System requires emergency repair');
        }

        return recommendations;
    };

    const generateFailurePredictions = (system: SystemStatus): Array<{ component: string; probability: number; timeframe: string }> => {
        const predictions: Array<{ component: string; probability: number; timeframe: string }> = [];

        if (system.strain > 80) {
            predictions.push({
                component: 'Power Couplings',
                probability: Math.min(95, system.strain + Math.random() * 10),
                timeframe: system.strain > 90 ? '< 1 hour' : '< 6 hours'
            });
        }

        if (system.health < 50) {
            predictions.push({
                component: 'Primary Systems',
                probability: Math.min(90, (100 - system.health) + Math.random() * 20),
                timeframe: system.health < 30 ? '< 30 minutes' : '< 2 hours'
            });
        }

        if (system.efficiency < 60) {
            predictions.push({
                component: 'Efficiency Regulators',
                probability: Math.min(80, (100 - system.efficiency) * 0.8),
                timeframe: '< 4 hours'
            });
        }

        return predictions;
    };

    const generateMaintenanceSchedule = (system: SystemStatus): Array<{ task: string; priority: 'low' | 'medium' | 'high'; estimatedTime: string }> => {
        const schedule: Array<{ task: string; priority: 'low' | 'medium' | 'high'; estimatedTime: string }> = [];

        if (system.strain > 50) {
            schedule.push({
                task: 'System Stress Relief Procedure',
                priority: system.strain > 80 ? 'high' : 'medium',
                estimatedTime: '15 minutes'
            });
        }

        if (system.efficiency < 90) {
            schedule.push({
                task: 'Performance Calibration',
                priority: system.efficiency < 70 ? 'high' : 'low',
                estimatedTime: '30 minutes'
            });
        }

        if (system.health < 95) {
            schedule.push({
                task: 'Preventive Maintenance',
                priority: system.health < 80 ? 'medium' : 'low',
                estimatedTime: '45 minutes'
            });
        }

        return schedule;
    };

    const performSystemCalibration = (systemName: string, calibrationType: 'efficiency' | 'power' | 'thermal' = 'efficiency') => {
        const system = engineeringState.systemStatus[systemName];

        if (system.criticalDamage) {
            console.warn(`⚠️ Cannot calibrate critically damaged system: ${systemName}`);
            return;
        }

        setEngineeringState(prev => {
            const updatedSystem = { ...prev.systemStatus[systemName] };

            switch (calibrationType) {
                case 'efficiency':
                    updatedSystem.efficiency = Math.min(100, updatedSystem.efficiency + 5 + Math.random() * 10);
                    break;
                case 'power':
                    updatedSystem.strain = Math.max(0, updatedSystem.strain - 10 - Math.random() * 5);
                    break;
                case 'thermal':
                    updatedSystem.strain = Math.max(0, updatedSystem.strain - 5);
                    updatedSystem.efficiency = Math.min(100, updatedSystem.efficiency + 3);
                    break;
            }

            return {
                ...prev,
                systemStatus: {
                    ...prev.systemStatus,
                    [systemName]: updatedSystem
                }
            };
        });

        // Emit calibration event
        if (socket) {
            socket.emit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'system_calibration',
                system: systemName,
                calibrationType: calibrationType
            });
        }

        console.log(`🔧 System calibration completed: ${systemName} (${calibrationType})`);
    };

    const analyzeSystemPerformance = (systemName: string, timeRange: number = 300): any => {
        // Analyze performance over the last timeRange seconds (default 5 minutes)
        const cutoffTime = Date.now() - (timeRange * 1000);
        const relevantHistory = performanceHistory.filter(entry =>
            entry.systemName === systemName && entry.timestamp > cutoffTime
        );

        if (relevantHistory.length === 0) {
            return {
                systemName,
                timeRange,
                status: 'insufficient_data',
                message: 'Not enough historical data for analysis'
            };
        }

        const avgHealth = relevantHistory.reduce((sum, entry) => sum + entry.health, 0) / relevantHistory.length;
        const avgEfficiency = relevantHistory.reduce((sum, entry) => sum + entry.efficiency, 0) / relevantHistory.length;
        const avgStrain = relevantHistory.reduce((sum, entry) => sum + entry.strain, 0) / relevantHistory.length;

        const healthTrend = calculateTrend(relevantHistory.map(entry => entry.health));
        const efficiencyTrend = calculateTrend(relevantHistory.map(entry => entry.efficiency));
        const strainTrend = calculateTrend(relevantHistory.map(entry => entry.strain));

        return {
            systemName,
            timeRange,
            averages: {
                health: avgHealth,
                efficiency: avgEfficiency,
                strain: avgStrain
            },
            trends: {
                health: healthTrend,
                efficiency: efficiencyTrend,
                strain: strainTrend
            },
            recommendations: generatePerformanceRecommendations(avgHealth, avgEfficiency, avgStrain, healthTrend, efficiencyTrend, strainTrend),
            status: 'analysis_complete'
        };
    };

    const calculateTrend = (values: number[]): 'improving' | 'stable' | 'declining' => {
        if (values.length < 2) return 'stable';

        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));

        const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

        const difference = secondAvg - firstAvg;

        if (Math.abs(difference) < 2) return 'stable';
        return difference > 0 ? 'improving' : 'declining';
    };

    const generatePerformanceRecommendations = (avgHealth: number, avgEfficiency: number, avgStrain: number, healthTrend: string, efficiencyTrend: string, strainTrend: string): string[] => {
        const recommendations: string[] = [];

        if (healthTrend === 'declining') {
            recommendations.push('Health is declining - schedule preventive maintenance');
        }
        if (efficiencyTrend === 'declining') {
            recommendations.push('Efficiency is dropping - perform system calibration');
        }
        if (strainTrend === 'improving' && avgStrain > 60) {
            recommendations.push('Strain levels increasing - reduce system load');
        }
        if (avgHealth < 80 && healthTrend === 'stable') {
            recommendations.push('System health below optimal - consider repair procedures');
        }
        if (avgEfficiency < 85 && efficiencyTrend === 'stable') {
            recommendations.push('System efficiency suboptimal - calibration recommended');
        }

        return recommendations;
    };

    const updatePredictiveAlerts = () => {
        const newAlerts: Array<{ id: string; systemName: string; type: string; severity: 'low' | 'medium' | 'high'; message: string; timestamp: number }> = [];

        Object.entries(engineeringState.systemStatus).forEach(([systemName, system]) => {
            // Predictive failure alerts
            if (system.strain > 85 && !system.criticalDamage) {
                newAlerts.push({
                    id: `strain_${systemName}_${Date.now()}`,
                    systemName,
                    type: 'strain_warning',
                    severity: 'high',
                    message: `${systemName} strain critical - failure imminent`,
                    timestamp: Date.now()
                });
            }

            if (system.health < 40 && system.health > 20) {
                newAlerts.push({
                    id: `health_${systemName}_${Date.now()}`,
                    systemName,
                    type: 'health_warning',
                    severity: 'medium',
                    message: `${systemName} health degrading - maintenance required`,
                    timestamp: Date.now()
                });
            }

            if (system.efficiency < 60 && !system.damaged) {
                newAlerts.push({
                    id: `efficiency_${systemName}_${Date.now()}`,
                    systemName,
                    type: 'efficiency_warning',
                    severity: 'low',
                    message: `${systemName} efficiency below optimal - calibration suggested`,
                    timestamp: Date.now()
                });
            }
        });

        // Remove old alerts (older than 5 minutes)
        const cutoffTime = Date.now() - (5 * 60 * 1000);
        const filteredAlerts = [...predictiveAlerts, ...newAlerts].filter(alert => alert.timestamp > cutoffTime);

        setPredictiveAlerts(filteredAlerts);
    };

    // Performance history tracking
    useEffect(() => {
        const historyInterval = setInterval(() => {
            const timestamp = Date.now();
            const newEntries = Object.entries(engineeringState.systemStatus).map(([systemName, system]) => ({
                timestamp,
                systemName,
                health: system.health,
                efficiency: system.efficiency,
                strain: system.strain
            }));

            setPerformanceHistory(prev => {
                const updated = [...prev, ...newEntries];
                // Keep only last 100 entries per system (about 16 minutes of data)
                return updated.slice(-600); // 6 systems * 100 entries
            });
        }, 10000); // Update every 10 seconds

        return () => clearInterval(historyInterval);
    }, [engineeringState.systemStatus]);

    // Predictive maintenance alerts
    useEffect(() => {
        const alertInterval = setInterval(() => {
            updatePredictiveAlerts();
        }, 30000); // Check every 30 seconds

        return () => clearInterval(alertInterval);
    }, [engineeringState.systemStatus, predictiveAlerts]);

    // Enhanced input validation and error handling
    const [errorMessages, setErrorMessages] = useState<Array<{ id: string; message: string; type: 'error' | 'warning' | 'info'; timestamp: number }>>([]);
    const [networkStatus, setNetworkStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');

    const addErrorMessage = (message: string, type: 'error' | 'warning' | 'info' = 'error') => {
        const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newError = {
            id: errorId,
            message,
            type,
            timestamp: Date.now()
        };

        setErrorMessages(prev => [...prev, newError].slice(-10)); // Keep last 10 errors

        // Auto-remove error after 5 seconds for info/warning, 10 seconds for errors
        setTimeout(() => {
            setErrorMessages(prev => prev.filter(error => error.id !== errorId));
        }, type === 'error' ? 10000 : 5000);

        console.log(`${type.toUpperCase()}: ${message}`);
    };

    const validatePowerAllocationInput = (systemName: string, value: number): { valid: boolean; error?: string } => {
        // Input range validation
        if (isNaN(value) || value < 0) {
            return { valid: false, error: `Invalid power value for ${systemName}: must be a positive number` };
        }

        if (value > 100) {
            return { valid: false, error: `Power allocation for ${systemName} cannot exceed 100%` };
        }

        // System-specific validation
        const system = engineeringState.systemStatus[systemName];
        if (!system) {
            return { valid: false, error: `Unknown system: ${systemName}` };
        }

        // Check if system is offline
        if (system.efficiency === 0 && value > 0) {
            return { valid: false, error: `Cannot allocate power to offline system: ${systemName}` };
        }

        // Total power validation
        const currentAllocations = { ...engineeringState.powerDistribution.powerAllocations };
        currentAllocations[systemName as keyof typeof currentAllocations] = value;
        const totalAllocated = Object.values(currentAllocations).reduce((sum, allocation) => sum + allocation, 0);
        const totalAvailable = calculateTotalAvailablePower();

        if (totalAllocated > totalAvailable) {
            return {
                valid: false,
                error: `Power overallocation: ${totalAllocated} units requested, only ${totalAvailable} available`
            };
        }

        return { valid: true };
    };

    const validateDroidAssignment = (taskId: string, droidCount: number): { valid: boolean; error?: string } => {
        if (isNaN(droidCount) || droidCount < 1) {
            return { valid: false, error: 'Droid assignment must be at least 1' };
        }

        if (droidCount > 10) {
            return { valid: false, error: 'Cannot assign more than 10 droids to a single task' };
        }

        const task = engineeringState.repairQueue.find(t => t.id === taskId);
        if (!task) {
            return { valid: false, error: 'Repair task not found' };
        }

        // Check total droid availability using GM-controlled droid count
        const totalAssignedDroids = engineeringState.repairQueue.reduce((sum, t) => sum + t.assignedCrew, 0);
        const availableDroidsForTask = availableDroids - totalAssignedDroids + task.assignedCrew; // Add back current task's droids

        if (droidCount > availableDroidsForTask) {
            return {
                valid: false,
                error: `Insufficient droids available: ${droidCount} requested, only ${availableDroidsForTask} available`
            };
        }

        return { valid: true };
    };

    const validateEmergencyProcedure = (procedureType: string): { valid: boolean; error?: string; requiresConfirmation?: boolean } => {
        switch (procedureType) {
            case 'emergency_power':
                if (engineeringState.powerDistribution.reactorOutput < 50) {
                    return {
                        valid: false,
                        error: 'Cannot activate emergency power: reactor output below 50%'
                    };
                }
                return {
                    valid: true,
                    requiresConfirmation: true
                };

            case 'emergency_shutdown':
                const criticalSystems = Object.entries(engineeringState.systemStatus)
                    .filter(([, status]) => status.criticalDamage);

                if (criticalSystems.length === 0) {
                    return {
                        valid: false,
                        error: 'No critical systems requiring emergency shutdown'
                    };
                }
                return {
                    valid: true,
                    requiresConfirmation: true
                };

            case 'life_support_priority':
                if (calculateTotalAvailablePower() < 40) {
                    return {
                        valid: false,
                        error: 'Insufficient power for life support priority mode'
                    };
                }
                return {
                    valid: true,
                    requiresConfirmation: true
                };

            default:
                return {
                    valid: false,
                    error: `Unknown emergency procedure: ${procedureType}`
                };
        }
    };

    const validateSystemBoost = (systemName: string, boostType: 'performance' | 'efficiency' | 'output', magnitude: number): { valid: boolean; error?: string } => {
        const system = engineeringState.systemStatus[systemName];
        if (!system) {
            return { valid: false, error: `Unknown system: ${systemName}` };
        }

        if (system.criticalDamage) {
            return { valid: false, error: `Cannot boost critically damaged system: ${systemName}` };
        }

        if (magnitude < 1 || magnitude > 5) {
            return { valid: false, error: 'Boost magnitude must be between 1 and 5' };
        }

        const strainCost = calculateBoostStrainCost(systemName, boostType, magnitude);
        if (system.strain + strainCost > 100) {
            return {
                valid: false,
                error: `Boost would cause system overload: ${system.strain + strainCost}% strain (max 100%)`
            };
        }

        // Check for existing boost of same type
        const existingBoost = engineeringState.activeBoosts.find(boost =>
            boost.systemName === systemName && boost.boostType === boostType
        );
        if (existingBoost) {
            return { valid: false, error: `${boostType} boost already active on ${systemName}` };
        }

        return { valid: true };
    };

    const handleNetworkError = (error: any, operation: string) => {
        console.error(`Network error during ${operation}:`, error);
        setNetworkStatus('disconnected');
        addErrorMessage(`Network error: ${operation} failed. Operating in offline mode.`, 'warning');

        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
            if (socket && !socket.connected) {
                setNetworkStatus('reconnecting');
                addErrorMessage('Attempting to reconnect...', 'info');
            }
        }, 3000);
    };

    const safeSocketEmit = (event: string, data: any, operation: string) => {
        try {
            if (!socket) {
                addErrorMessage('No socket connection available', 'warning');
                return false;
            }

            if (!socket.connected) {
                addErrorMessage(`Cannot ${operation}: disconnected from server`, 'warning');
                return false;
            }

            socket.emit(event, data);
            return true;
        } catch (error) {
            handleNetworkError(error, operation);
            return false;
        }
    };

    // Enhanced power allocation with validation
    const updatePowerAllocationSafe = (systemName: string, newValue: number) => {
        try {
            // Input validation
            const validation = validatePowerAllocationInput(systemName, newValue);
            if (!validation.valid) {
                addErrorMessage(validation.error!, 'error');
                return false;
            }

            // Proceed with original logic
            const newAllocations = {
                ...engineeringState.powerDistribution.powerAllocations,
                [systemName]: newValue
            };

            setEngineeringState(prev => ({
                ...prev,
                powerDistribution: {
                    ...prev.powerDistribution,
                    powerAllocations: newAllocations
                }
            }));

            // Add to power history (keep last 20 entries)
            setPowerHistory(prev => {
                const newEntry = {
                    timestamp: Date.now(),
                    allocations: newAllocations
                };
                const updatedHistory = [...prev, newEntry].slice(-20);
                return updatedHistory;
            });

            // Calculate effective power for the system
            const effectivePower = calculatePowerEfficiency(systemName, newValue);

            // Safe socket emission
            safeSocketEmit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'power_allocation_change',
                system: systemName,
                value: newValue,
                effectivePower: effectivePower,
                totalAllocated: Object.values(newAllocations).reduce((total, allocation) => total + allocation, 0),
                efficiency: calculatePowerEfficiency(systemName, newValue) / newValue * 100
            }, 'update power allocation');

            console.log(`⚡ Power allocation updated: ${systemName} = ${newValue}% (${effectivePower}% effective)`);
            return true;

        } catch (error) {
            addErrorMessage(`Failed to update power allocation for ${systemName}: ${error}`, 'error');
            console.error('Power allocation error:', error);
            return false;
        }
    };

    // Enhanced droid assignment with validation
    const updateRepairTaskDroidsSafe = (taskId: string, newDroidCount: number) => {
        try {
            const validation = validateDroidAssignment(taskId, newDroidCount);
            if (!validation.valid) {
                addErrorMessage(validation.error!, 'error');
                return false;
            }

            setEngineeringState(prev => ({
                ...prev,
                repairQueue: prev.repairQueue.map(task => {
                    if (task.id === taskId) {
                        const updatedTimeRequired = calculateRepairTime(task.damageType, newDroidCount);
                        return {
                            ...task,
                            assignedCrew: newDroidCount,
                            timeRequired: updatedTimeRequired
                        };
                    }
                    return task;
                })
            }));

            console.log(`🤖 Repair task ${taskId} droids updated to ${newDroidCount}`);
            return true;

        } catch (error) {
            addErrorMessage(`Failed to update droid assignment: ${error}`, 'error');
            console.error('Droid assignment error:', error);
            return false;
        }
    };

    // Enhanced emergency procedures with validation and confirmation
    const activateEmergencyProcedureSafe = (procedureType: string, systemName?: string) => {
        try {
            const validation = validateEmergencyProcedure(procedureType);
            if (!validation.valid) {
                addErrorMessage(validation.error!, 'error');
                return false;
            }

            if (validation.requiresConfirmation) {
                const confirmMessage = `⚠️ CONFIRM EMERGENCY PROCEDURE\n\nActivate ${procedureType.replace('_', ' ').toUpperCase()}?\n\nThis action may have significant consequences.`;
                if (!window.confirm(confirmMessage)) {
                    addErrorMessage('Emergency procedure cancelled by user', 'info');
                    return false;
                }
            }

            // Execute the appropriate emergency procedure
            switch (procedureType) {
                case 'emergency_power':
                    toggleEmergencyPower();
                    break;
                case 'emergency_shutdown':
                    if (systemName) {
                        activateEmergencyShutdown(systemName);
                    }
                    break;
                case 'life_support_priority':
                    activateLifeSupportPriority();
                    break;
                default:
                    addErrorMessage(`Unknown emergency procedure: ${procedureType}`, 'error');
                    return false;
            }

            addErrorMessage(`Emergency procedure activated: ${procedureType}`, 'warning');
            return true;

        } catch (error) {
            addErrorMessage(`Failed to activate emergency procedure: ${error}`, 'error');
            console.error('Emergency procedure error:', error);
            return false;
        }
    };

    // Enhanced system boost with validation
    const applySystemBoostSafe = (systemName: string, boostType: 'performance' | 'efficiency' | 'output', magnitude: number) => {
        try {
            const validation = validateSystemBoost(systemName, boostType, magnitude);
            if (!validation.valid) {
                addErrorMessage(validation.error!, 'error');
                return false;
            }

            const newBoost = createSystemBoost(systemName, boostType, magnitude);

            setEngineeringState(prev => {
                // Add strain to the system
                const updatedSystemStatus = {
                    ...prev.systemStatus,
                    [systemName]: {
                        ...prev.systemStatus[systemName],
                        strain: Math.min(100, prev.systemStatus[systemName].strain + newBoost.strainCost)
                    }
                };

                return {
                    ...prev,
                    systemStatus: updatedSystemStatus,
                    activeBoosts: [...prev.activeBoosts, newBoost]
                };
            });

            // Safe socket emission
            safeSocketEmit('engineering_action', {
                room: new URLSearchParams(window.location.search).get('room') || 'default',
                type: 'system_boost_activated',
                boost: newBoost
            }, 'activate system boost');

            console.log(`🚀 System boost activated: ${systemName} ${boostType} +${magnitude} (${newBoost.strainCost} strain)`);
            return true;

        } catch (error) {
            addErrorMessage(`Failed to apply system boost: ${error}`, 'error');
            console.error('System boost error:', error);
            return false;
        }
    };

    // Emergency power toggle
    const toggleEmergencyPower = () => {
        const newEmergencyState = !engineeringState.powerDistribution.emergencyPower;

        const basePower = engineeringState.powerDistribution.reactorOutput;
        const newTotalPower = basePower + (newEmergencyState ? 100 : 0);

        setEngineeringState(prev => ({
            ...prev,
            powerDistribution: {
                ...prev.powerDistribution,
                emergencyPower: newEmergencyState,
                totalPower: newTotalPower
            },
            emergencyProcedures: {
                ...prev.emergencyProcedures,
                emergencyPowerActive: newEmergencyState
            }
        }));

        // Safe socket emission
        safeSocketEmit('engineering_action', {
            room: new URLSearchParams(window.location.search).get('room') || 'default',
            type: 'emergency_power_toggle',
            value: newEmergencyState
        }, 'toggle emergency power');

        console.log(`🚨 Emergency power ${newEmergencyState ? 'ACTIVATED' : 'DEACTIVATED'}`);
    };

    // Enhanced socket integration with error handling
    useEffect(() => {
        if (!socket) {
            setNetworkStatus('disconnected');
            addErrorMessage('No socket connection available', 'warning');
            return;
        }

        console.log('🔧 Engineering Station using shared socket connection');

        // Get room from URL parameter
        const room = new URLSearchParams(window.location.search).get('room') || 'default';

        // Join the room for proper message routing
        try {
            socket.emit('join', { room, station: 'engineering' });
        } catch (error) {
            handleNetworkError(error, 'join room');
        }

        // Enhanced connection status monitoring
        socket.on('connect', () => {
            console.log('🔧 Engineering Station connected');
            setNetworkStatus('connected');
            addErrorMessage('Connected to bridge network', 'info');
        });

        socket.on('disconnect', (reason: string) => {
            console.warn('⚠️ Engineering Station disconnected:', reason);
            setNetworkStatus('disconnected');
            addErrorMessage(`Disconnected from bridge network: ${reason}`, 'warning');
        });

        socket.on('reconnect', () => {
            console.log('🔧 Engineering Station reconnected');
            setNetworkStatus('connected');
            addErrorMessage('Reconnected to bridge network', 'info');
        });

        socket.on('reconnect_attempt', () => {
            setNetworkStatus('reconnecting');
        });

        // Listen for GM broadcasts with error handling
        socket.on('gm_broadcast', (data: { type: string; value: any; room: string; source: string }) => {
            try {
                console.log('🔧 Engineering Station received GM broadcast:', data);
                console.log('🔧 Engineering Station - Broadcast type:', data.type, 'Value:', data.value);

                switch (data.type) {
                    case 'test_connection':
                        console.log('🧪 Engineering Station: Test connection received!', data.value);
                        addErrorMessage('GM connection test received!', 'info');
                        break;
                    case 'system_damage':
                        console.log('🔧 Engineering Station: Processing system damage:', data.value);
                        handleGMSystemDamage(data.value);
                        break;
                    case 'system_repair':
                        handleGMSystemRepair(data.value);
                        break;
                    case 'system_malfunction':
                        handleGMSystemMalfunction(data.value);
                        break;
                    case 'power_update':
                        handleGMPowerUpdate(data.value);
                        break;
                    case 'reactor_fluctuation':
                        handleGMReactorFluctuation(data.value);
                        break;
                    case 'emergency_scenario':
                        handleGMEmergencyScenario(data.value);
                        break;
                    case 'system_configuration':
                        handleGMSystemConfiguration(data.value);
                        break;
                    case 'random_event':
                        handleGMRandomEvent(data.value);
                        break;
                    case 'droid_allocation':
                        handleGMDroidAllocation(data.value);
                        break;
                    case 'ship_strain_update':
                        handleGMShipStrainUpdate(data.value);
                        break;
                    default:
                        console.log('Unknown GM broadcast type:', data.type);
                        addErrorMessage(`Unknown GM broadcast: ${data.type}`, 'warning');
                        break;
                }
            } catch (error) {
                addErrorMessage(`Error processing GM broadcast: ${error}`, 'error');
                console.error('GM broadcast error:', error);
            }
        });

        // Listen for player actions from GM station
        socket.on('player_action', (data: { action: string; value: any; room: string; target?: string }) => {
            try {
                console.log('🔧 Engineering Station received player action:', data);

                // Only process actions targeted at engineering station
                if (data.target === 'engineering' || !data.target) {
                    switch (data.action) {
                        case 'set_reactor_output':
                            handleReactorOutputChange(data.value);
                            break;
                        default:
                            console.log('Unknown player action:', data.action);
                            break;
                    }
                }
            } catch (error) {
                addErrorMessage(`Error processing player action: ${error}`, 'error');
                console.error('Player action error:', error);
            }
        });

        // Listen for engineering-specific broadcasts
        socket.on('engineering_broadcast', (data: { type: string; value: any; room: string; source: string }) => {
            try {
                console.log('🔧 Engineering Station received engineering broadcast:', data);
                // Handle engineering-specific messages
            } catch (error) {
                addErrorMessage(`Error processing engineering broadcast: ${error}`, 'error');
                console.error('Engineering broadcast error:', error);
            }
        });

        // Enhanced error handling
        socket.on('error', (error: any) => {
            console.error('🚨 Engineering Station socket error:', error);
            handleNetworkError(error, 'socket communication');
        });

        socket.on('connect_error', (error: any) => {
            console.error('🚨 Engineering Station connection error:', error);
            handleNetworkError(error, 'connection');
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('reconnect');
            socket.off('reconnect_attempt');
            socket.off('gm_broadcast');
            socket.off('engineering_broadcast');
            socket.off('error');
            socket.off('connect_error');
        };
    }, [socket, onPlayerAction]);

    // Enhanced styling with visual effects and animations
    const containerStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: 'auto auto',
        gap: '15px',
        padding: '15px',
        background: `
            radial-gradient(circle at 20% 20%, rgba(255, 140, 0, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(0, 255, 255, 0.05) 0%, transparent 50%),
            linear-gradient(135deg, rgba(0, 20, 40, 0.9) 0%, rgba(10, 10, 30, 0.95) 50%, rgba(0, 0, 0, 0.98) 100%)
        `,
        position: 'relative'
    };

    const scrollContainerStyle: React.CSSProperties = {
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: '#000',
        position: 'relative'
    };

    // Enhanced panel styling with sci-fi effects
    const getPanelStyle = (alertLevel?: 'none' | 'warning' | 'critical'): React.CSSProperties => {
        const baseStyle: React.CSSProperties = {
            background: `
                linear-gradient(135deg, 
                    rgba(20, 10, 0, 0.95) 0%, 
                    rgba(30, 15, 5, 0.9) 50%, 
                    rgba(25, 12, 2, 0.95) 100%
                ),
                radial-gradient(circle at 10% 10%, rgba(255, 140, 0, 0.1) 0%, transparent 50%)
            `,
            border: '2px solid #ff8c00',
            borderRadius: '12px',
            padding: '15px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            minHeight: '400px',
            boxShadow: `
                0 0 20px rgba(255, 140, 0, 0.4),
                inset 0 1px 0 rgba(255, 140, 0, 0.2),
                inset 0 -1px 0 rgba(255, 140, 0, 0.1)
            `,
            backdropFilter: 'blur(2px)',
            transition: 'all 0.3s ease',
            overflow: 'hidden'
        };

        // Add emergency visual effects based on alert level
        if (alertLevel === 'critical') {
            return {
                ...baseStyle,
                border: '2px solid #ff4444',
                boxShadow: `
                    0 0 30px rgba(255, 68, 68, 0.6),
                    inset 0 1px 0 rgba(255, 68, 68, 0.3),
                    inset 0 -1px 0 rgba(255, 68, 68, 0.2)
                `,
                animation: 'criticalPulse 2s infinite'
            };
        } else if (alertLevel === 'warning') {
            return {
                ...baseStyle,
                border: '2px solid #ffaa44',
                boxShadow: `
                    0 0 25px rgba(255, 170, 68, 0.5),
                    inset 0 1px 0 rgba(255, 170, 68, 0.25),
                    inset 0 -1px 0 rgba(255, 170, 68, 0.15)
                `,
                animation: 'warningGlow 3s infinite'
            };
        }

        return baseStyle;
    };

    const panelTitleStyle: React.CSSProperties = {
        color: '#ff8c00',
        margin: '0 0 15px 0',
        textAlign: 'center',
        fontSize: '1.1rem',
        textShadow: '0 0 10px currentColor, 0 0 20px rgba(255, 140, 0, 0.5)',
        letterSpacing: '2px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        position: 'relative'
    };

    return (
        <div style={scrollContainerStyle}>
            {/* Error Display Panel */}
            {(errorMessages.length > 0 || networkStatus !== 'connected') && (
                <div style={{
                    position: 'fixed',
                    top: '50px',
                    right: '20px',
                    zIndex: 1000,
                    maxWidth: '400px',
                    background: 'rgba(0, 0, 0, 0.9)',
                    border: '2px solid #ff8c00',
                    borderRadius: '8px',
                    padding: '10px',
                    boxShadow: '0 0 20px rgba(255, 140, 0, 0.5)'
                }}>
                    {/* Network Status */}
                    {networkStatus !== 'connected' && (
                        <div style={{
                            marginBottom: '8px',
                            padding: '6px',
                            background: networkStatus === 'reconnecting' ? 'rgba(255, 170, 68, 0.2)' : 'rgba(255, 68, 68, 0.2)',
                            border: `1px solid ${networkStatus === 'reconnecting' ? '#ffaa44' : '#ff4444'}`,
                            borderRadius: '4px',
                            fontSize: '12px',
                            color: networkStatus === 'reconnecting' ? '#ffaa44' : '#ff4444',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            animation: networkStatus === 'reconnecting' ? 'blink 1s infinite' : 'none'
                        }}>
                            {networkStatus === 'reconnecting' ? '🔄 RECONNECTING...' : '🚫 NETWORK DISCONNECTED'}
                        </div>
                    )}

                    {/* Error Messages */}
                    {errorMessages.slice(-5).map((error) => {
                        const errorColor = error.type === 'error' ? '#ff4444' :
                            error.type === 'warning' ? '#ffaa44' : '#44ffff';
                        const errorIcon = error.type === 'error' ? '🚨' :
                            error.type === 'warning' ? '⚠️' : 'ℹ️';

                        return (
                            <div key={error.id} style={{
                                marginBottom: '6px',
                                padding: '6px',
                                background: `rgba(${error.type === 'error' ? '255, 68, 68' : error.type === 'warning' ? '255, 170, 68' : '68, 255, 255'}, 0.2)`,
                                border: `1px solid ${errorColor}`,
                                borderRadius: '4px',
                                fontSize: '11px',
                                color: errorColor,
                                animation: error.type === 'error' ? 'slideIn 0.3s ease-out' : 'none'
                            }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                                    {errorIcon} {error.type.toUpperCase()}
                                </div>
                                <div>{error.message}</div>
                                <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>
                                    {new Date(error.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        );
                    })}

                    {/* Clear Errors Button */}
                    {errorMessages.length > 0 && (
                        <button
                            onClick={() => setErrorMessages([])}
                            style={{
                                width: '100%',
                                padding: '4px',
                                background: 'linear-gradient(45deg, #666, #888)',
                                border: '1px solid #888',
                                borderRadius: '4px',
                                color: '#fff',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                textTransform: 'uppercase',
                                marginTop: '6px'
                            }}
                        >
                            Clear Messages
                        </button>
                    )}
                </div>
            )}

            <div style={containerStyle}>
                {/* Power Management Panel */}
                <div style={getPanelStyle(calculateTotalAllocatedPower() > calculateTotalAvailablePower() ? 'warning' : 'none')} className="engineering-panel">
                    <h3 style={panelTitleStyle}>POWER DISTRIBUTION</h3>
                    <div style={{ color: '#ff8c00', fontSize: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Reactor Status */}
                        <div style={{ marginBottom: '15px', padding: '8px', background: 'rgba(255, 140, 0, 0.1)', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <span>Reactor Output:</span>
                                <span style={{ fontWeight: 'bold' }}>{engineeringState.powerDistribution.reactorOutput}%</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <span>Available Power:</span>
                                <span style={{ fontWeight: 'bold', color: engineeringState.powerDistribution.emergencyPower ? '#ff4444' : '#ff8c00' }}>
                                    {calculateTotalAvailablePower()} units
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Allocated:</span>
                                <span style={{
                                    fontWeight: 'bold',
                                    color: calculateTotalAllocatedPower() > calculateTotalAvailablePower() ? '#ff4444' : '#44ff44'
                                }}>
                                    {calculateTotalAllocatedPower()} units
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Ship Strain:</span>
                                <span style={{
                                    fontWeight: 'bold',
                                    color: (() => {
                                        return shipStrain.current > 70 ? '#ff4444' : shipStrain.current > 40 ? '#ffaa44' : '#44ff44';
                                    })()
                                }}>
                                    {shipStrain.current}/{shipStrain.maximum}
                                </span>
                            </div>
                        </div>

                        {/* Emergency Power Toggle */}
                        <div style={{ marginBottom: '15px' }}>
                            <button
                                onClick={toggleEmergencyPower}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    background: engineeringState.powerDistribution.emergencyPower
                                        ? 'linear-gradient(45deg, #ff4444, #ff8888)'
                                        : 'linear-gradient(45deg, #444, #666)',
                                    border: `2px solid ${engineeringState.powerDistribution.emergencyPower ? '#ff4444' : '#888'}`,
                                    borderRadius: '4px',
                                    color: '#fff',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    boxShadow: engineeringState.powerDistribution.emergencyPower
                                        ? '0 0 10px rgba(255, 68, 68, 0.5)'
                                        : 'none'
                                }}
                            >
                                {engineeringState.powerDistribution.emergencyPower ? '🚨 EMERGENCY POWER ACTIVE' : 'ACTIVATE EMERGENCY POWER'}
                            </button>
                        </div>

                        {/* Power Allocation Sliders */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {Object.entries(engineeringState.powerDistribution.powerAllocations).map(([systemName, allocation]) => {
                                const requirements = calculateSystemRequirements(systemName);
                                const isUnderPowered = allocation < requirements.minimum;
                                const isOptimal = allocation >= requirements.optimal;

                                return (
                                    <div key={systemName} style={{ marginBottom: '12px' }}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '4px'
                                        }}>
                                            <span style={{
                                                textTransform: 'uppercase',
                                                fontSize: '11px',
                                                color: isUnderPowered ? '#ff4444' : isOptimal ? '#44ff44' : '#ffaa44'
                                            }}>
                                                {systemName}
                                            </span>
                                            <span style={{
                                                fontWeight: 'bold',
                                                color: isUnderPowered ? '#ff4444' : isOptimal ? '#44ff44' : '#ffaa44'
                                            }}>
                                                {allocation}%
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={allocation}
                                            onChange={(e) => updatePowerAllocationSafe(systemName, parseInt(e.target.value))}
                                            style={{
                                                width: '100%',
                                                height: '6px',
                                                background: `linear-gradient(to right, 
                                                #ff4444 0%, 
                                                #ff4444 ${(requirements.minimum / 100) * 100}%, 
                                                #ffaa44 ${(requirements.minimum / 100) * 100}%, 
                                                #ffaa44 ${(requirements.optimal / 100) * 100}%, 
                                                #44ff44 ${(requirements.optimal / 100) * 100}%, 
                                                #44ff44 100%)`,
                                                borderRadius: '3px',
                                                outline: 'none',
                                                cursor: 'pointer'
                                            }}
                                        />
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            fontSize: '9px',
                                            color: '#888',
                                            marginTop: '2px'
                                        }}>
                                            <span>Min: {requirements.minimum}</span>
                                            <span>Opt: {requirements.optimal}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Power Status Warning */}
                        {calculateTotalAllocatedPower() > calculateTotalAvailablePower() && (
                            <div style={{
                                marginTop: '10px',
                                padding: '6px',
                                background: 'rgba(255, 68, 68, 0.2)',
                                border: '1px solid #ff4444',
                                borderRadius: '4px',
                                fontSize: '10px',
                                textAlign: 'center',
                                color: '#ff4444',
                                fontWeight: 'bold',
                                animation: 'blink 1s infinite'
                            }}>
                                ⚠️ POWER OVERALLOCATION
                            </div>
                        )}
                    </div>
                </div>

                {/* System Status Panel */}
                <div style={getPanelStyle((() => {
                    const criticalSystems = Object.entries(engineeringState.systemStatus).filter(([, status]) => status.criticalDamage);
                    const warningSystems = Object.entries(engineeringState.systemStatus).filter(([, status]) => status.damaged && !status.criticalDamage);
                    return criticalSystems.length > 0 ? 'critical' : warningSystems.length > 2 ? 'warning' : 'none';
                })())} className="engineering-panel">
                    <h3 style={panelTitleStyle}>SYSTEM STATUS</h3>
                    <div style={{ color: '#ff8c00', fontSize: '12px', height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                        {Object.entries(engineeringState.systemStatus).map(([systemName, status]) => {
                            const statusColor = getSystemStatusColor(status);
                            const alertLevel = getSystemAlertLevel(status);
                            const severity = classifyDamageSeverity(status.health);

                            return (
                                <div key={systemName} style={{
                                    marginBottom: '12px',
                                    padding: '8px',
                                    background: `rgba(${statusColor === '#ff4444' ? '255, 68, 68' : statusColor === '#ffaa44' ? '255, 170, 68' : statusColor === '#ffff44' ? '255, 255, 68' : '68, 255, 68'}, 0.1)`,
                                    border: `1px solid ${statusColor}`,
                                    borderRadius: '4px',
                                    position: 'relative'
                                }}>
                                    {/* System Name and Alert Indicator */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: '6px'
                                    }}>
                                        <span style={{
                                            fontWeight: 'bold',
                                            textTransform: 'uppercase',
                                            color: statusColor,
                                            fontSize: '11px'
                                        }}>
                                            {systemName}
                                        </span>
                                        {alertLevel !== 'none' && (
                                            <span style={{
                                                fontSize: '10px',
                                                fontWeight: 'bold',
                                                color: alertLevel === 'critical' ? '#ff4444' : '#ffaa44',
                                                animation: alertLevel === 'critical' ? 'blink 1s infinite' : 'none'
                                            }}>
                                                {alertLevel === 'critical' ? '🚨 CRITICAL' : '⚠️ WARNING'}
                                            </span>
                                        )}
                                    </div>

                                    {/* Health Bar */}
                                    <div style={{ marginBottom: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '2px' }}>
                                            <span>Health</span>
                                            <span style={{ color: statusColor }}>{status.health.toFixed(1)}%</span>
                                        </div>
                                        <div style={{
                                            width: '100%',
                                            height: '4px',
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            borderRadius: '2px',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                width: `${status.health}%`,
                                                height: '100%',
                                                background: `linear-gradient(to right, ${statusColor}, ${statusColor}aa)`,
                                                transition: 'width 0.3s ease'
                                            }} />
                                        </div>
                                    </div>

                                    {/* Efficiency Bar */}
                                    <div style={{ marginBottom: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '2px' }}>
                                            <span>Efficiency</span>
                                            <span style={{ color: status.efficiency > 80 ? '#44ff44' : status.efficiency > 50 ? '#ffaa44' : '#ff4444' }}>
                                                {status.efficiency.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div style={{
                                            width: '100%',
                                            height: '4px',
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            borderRadius: '2px',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                width: `${status.efficiency}%`,
                                                height: '100%',
                                                background: status.efficiency > 80 ? 'linear-gradient(to right, #44ff44, #44ff44aa)' :
                                                    status.efficiency > 50 ? 'linear-gradient(to right, #ffaa44, #ffaa44aa)' :
                                                        'linear-gradient(to right, #ff4444, #ff4444aa)',
                                                transition: 'width 0.3s ease'
                                            }} />
                                        </div>
                                    </div>

                                    {/* Strain Bar */}
                                    <div style={{ marginBottom: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '2px' }}>
                                            <span>Strain</span>
                                            <span style={{ color: status.strain > 80 ? '#ff4444' : status.strain > 50 ? '#ffaa44' : '#44ff44' }}>
                                                {status.strain.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div style={{
                                            width: '100%',
                                            height: '4px',
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            borderRadius: '2px',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                width: `${status.strain}%`,
                                                height: '100%',
                                                background: status.strain > 80 ? 'linear-gradient(to right, #ff4444, #ff4444aa)' :
                                                    status.strain > 50 ? 'linear-gradient(to right, #ffaa44, #ffaa44aa)' :
                                                        'linear-gradient(to right, #44ff44, #44ff44aa)',
                                                transition: 'width 0.3s ease'
                                            }} />
                                        </div>
                                    </div>

                                    {/* Damage Status */}
                                    {severity !== 'none' && (
                                        <div style={{
                                            fontSize: '9px',
                                            color: statusColor,
                                            fontWeight: 'bold',
                                            textTransform: 'uppercase',
                                            textAlign: 'center',
                                            marginTop: '4px',
                                            padding: '2px',
                                            background: 'rgba(0, 0, 0, 0.2)',
                                            borderRadius: '2px'
                                        }}>
                                            {severity} DAMAGE
                                        </div>
                                    )}

                                    {/* Repair Progress (if applicable) */}
                                    {status.repairProgress !== undefined && status.repairProgress > 0 && (
                                        <div style={{ marginTop: '4px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '2px' }}>
                                                <span>Repair Progress</span>
                                                <span style={{ color: '#44ff44' }}>{status.repairProgress.toFixed(1)}%</span>
                                            </div>
                                            <div style={{
                                                width: '100%',
                                                height: '3px',
                                                background: 'rgba(0, 0, 0, 0.3)',
                                                borderRadius: '2px',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{
                                                    width: `${status.repairProgress}%`,
                                                    height: '100%',
                                                    background: 'linear-gradient(to right, #44ff44, #44ff44aa)',
                                                    transition: 'width 0.3s ease'
                                                }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* System Alerts Summary */}
                        <div style={{
                            marginTop: 'auto',
                            padding: '8px',
                            background: 'rgba(255, 140, 0, 0.1)',
                            borderRadius: '4px',
                            border: '1px solid #ff8c00'
                        }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>
                                SYSTEM ALERTS
                            </div>
                            <div style={{ fontSize: '9px' }}>
                                {(() => {
                                    const criticalSystems = Object.entries(engineeringState.systemStatus)
                                        .filter(([, status]) => getSystemAlertLevel(status) === 'critical')
                                        .map(([name]) => name);
                                    const warningSystems = Object.entries(engineeringState.systemStatus)
                                        .filter(([, status]) => getSystemAlertLevel(status) === 'warning')
                                        .map(([name]) => name);

                                    if (criticalSystems.length === 0 && warningSystems.length === 0) {
                                        return <div style={{ color: '#44ff44', textAlign: 'center' }}>ALL SYSTEMS NOMINAL</div>;
                                    }

                                    return (
                                        <>
                                            {criticalSystems.length > 0 && (
                                                <div style={{ color: '#ff4444', marginBottom: '2px' }}>
                                                    🚨 Critical: {criticalSystems.join(', ')}
                                                </div>
                                            )}
                                            {warningSystems.length > 0 && (
                                                <div style={{ color: '#ffaa44' }}>
                                                    ⚠️ Warning: {warningSystems.join(', ')}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Repair Queue Panel */}
                <div style={getPanelStyle(engineeringState.repairQueue.length > 0 ? 'warning' : 'none')} className="engineering-panel">
                    <h3 style={panelTitleStyle}>REPAIR QUEUE</h3>
                    <div style={{ color: '#ff8c00', fontSize: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}>

                        {/* Droid Availability Display */}
                        <div style={{
                            marginBottom: '15px',
                            padding: '6px',
                            background: 'rgba(255, 140, 0, 0.1)',
                            borderRadius: '4px',
                            border: `1px solid ${availableDroids < 10 ? '#ff4444' : '#ff8c00'}`
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 'bold' }}>Available Droids:</span>
                                <span style={{
                                    fontWeight: 'bold',
                                    color: availableDroids < 10 ? '#ff4444' : availableDroids < 15 ? '#ffaa44' : '#44ff44'
                                }}>
                                    {availableDroids}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                                <span>Assigned:</span>
                                <span style={{ color: '#ffaa44' }}>
                                    {engineeringState.repairQueue.reduce((sum, task) => sum + task.assignedCrew, 0)}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                                <span>Free:</span>
                                <span style={{ color: '#44ff44' }}>
                                    {availableDroids - engineeringState.repairQueue.reduce((sum, task) => sum + task.assignedCrew, 0)}
                                </span>
                            </div>
                        </div>

                        {/* Ship Schematic with Damage Overlays */}
                        <div style={{ marginBottom: '15px', padding: '8px', background: 'rgba(255, 140, 0, 0.1)', borderRadius: '4px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
                                SHIP SCHEMATIC - DAMAGE STATUS
                            </div>
                            <div style={{
                                position: 'relative',
                                width: '100%',
                                height: '200px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                border: '1px solid #ff8c00'
                            }}>
                                {/* Ship Image */}
                                <img
                                    src="/assets/dorsal and side no bg.png"
                                    alt="Ship Schematic"
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain',
                                        opacity: 0.8,
                                        filter: 'brightness(1.2) contrast(1.1)'
                                    }}
                                />

                                {/* System Damage Overlays */}
                                {/* Engines - Rear section */}
                                <div style={{
                                    position: 'absolute',
                                    left: '75%',
                                    top: '40%',
                                    width: '20%',
                                    height: '20%',
                                    background: engineeringState.systemStatus.engines.criticalDamage
                                        ? 'rgba(255, 68, 68, 0.7)'
                                        : engineeringState.systemStatus.engines.damaged
                                            ? 'rgba(255, 170, 68, 0.5)'
                                            : 'rgba(68, 255, 68, 0.3)',
                                    border: `2px solid ${engineeringState.systemStatus.engines.criticalDamage
                                        ? '#ff4444'
                                        : engineeringState.systemStatus.engines.damaged
                                            ? '#ffaa44'
                                            : '#44ff44'}`,
                                    borderRadius: '50%',
                                    animation: engineeringState.systemStatus.engines.criticalDamage
                                        ? 'blink 1s infinite'
                                        : engineeringState.systemStatus.engines.damaged
                                            ? 'warningGlow 2s infinite'
                                            : 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '8px',
                                    fontWeight: 'bold',
                                    color: '#fff',
                                    textShadow: '0 0 4px rgba(0,0,0,0.8)'
                                }}
                                    onClick={() => {
                                        const assessment = assessSystemDamage('engines');
                                        if (assessment.needsRepair) {
                                            addRepairTask('engines', assessment.damageType!, 1);
                                        }
                                    }}
                                    title={`Engines: ${engineeringState.systemStatus.engines.health.toFixed(0)}% health`}
                                >
                                    ENG
                                </div>

                                {/* Weapons - Front section */}
                                <div style={{
                                    position: 'absolute',
                                    left: '5%',
                                    top: '35%',
                                    width: '15%',
                                    height: '30%',
                                    background: engineeringState.systemStatus.weapons.criticalDamage
                                        ? 'rgba(255, 68, 68, 0.7)'
                                        : engineeringState.systemStatus.weapons.damaged
                                            ? 'rgba(255, 170, 68, 0.5)'
                                            : 'rgba(68, 255, 68, 0.3)',
                                    border: `2px solid ${engineeringState.systemStatus.weapons.criticalDamage
                                        ? '#ff4444'
                                        : engineeringState.systemStatus.weapons.damaged
                                            ? '#ffaa44'
                                            : '#44ff44'}`,
                                    borderRadius: '20%',
                                    animation: engineeringState.systemStatus.weapons.criticalDamage
                                        ? 'blink 1s infinite'
                                        : engineeringState.systemStatus.weapons.damaged
                                            ? 'warningGlow 2s infinite'
                                            : 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '8px',
                                    fontWeight: 'bold',
                                    color: '#fff',
                                    textShadow: '0 0 4px rgba(0,0,0,0.8)'
                                }}
                                    onClick={() => {
                                        const assessment = assessSystemDamage('weapons');
                                        if (assessment.needsRepair) {
                                            addRepairTask('weapons', assessment.damageType!, 1);
                                        }
                                    }}
                                    title={`Weapons: ${engineeringState.systemStatus.weapons.health.toFixed(0)}% health`}
                                >
                                    WPN
                                </div>

                                {/* Shields - Mid section, distributed */}
                                <div style={{
                                    position: 'absolute',
                                    left: '35%',
                                    top: '20%',
                                    width: '30%',
                                    height: '60%',
                                    background: engineeringState.systemStatus.shields.criticalDamage
                                        ? 'rgba(255, 68, 68, 0.4)'
                                        : engineeringState.systemStatus.shields.damaged
                                            ? 'rgba(255, 170, 68, 0.3)'
                                            : 'rgba(68, 255, 68, 0.2)',
                                    border: `2px dashed ${engineeringState.systemStatus.shields.criticalDamage
                                        ? '#ff4444'
                                        : engineeringState.systemStatus.shields.damaged
                                            ? '#ffaa44'
                                            : '#44ff44'}`,
                                    borderRadius: '50%',
                                    animation: engineeringState.systemStatus.shields.criticalDamage
                                        ? 'blink 1s infinite'
                                        : engineeringState.systemStatus.shields.damaged
                                            ? 'warningGlow 2s infinite'
                                            : 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '8px',
                                    fontWeight: 'bold',
                                    color: '#fff',
                                    textShadow: '0 0 4px rgba(0,0,0,0.8)'
                                }}
                                    onClick={() => {
                                        const assessment = assessSystemDamage('shields');
                                        if (assessment.needsRepair) {
                                            addRepairTask('shields', assessment.damageType!, 1);
                                        }
                                    }}
                                    title={`Shields: ${engineeringState.systemStatus.shields.health.toFixed(0)}% health`}
                                >
                                    SHD
                                </div>

                                {/* Sensors - Top front section */}
                                <div style={{
                                    position: 'absolute',
                                    left: '20%',
                                    top: '10%',
                                    width: '15%',
                                    height: '15%',
                                    background: engineeringState.systemStatus.sensors.criticalDamage
                                        ? 'rgba(255, 68, 68, 0.7)'
                                        : engineeringState.systemStatus.sensors.damaged
                                            ? 'rgba(255, 170, 68, 0.5)'
                                            : 'rgba(68, 255, 68, 0.3)',
                                    border: `2px solid ${engineeringState.systemStatus.sensors.criticalDamage
                                        ? '#ff4444'
                                        : engineeringState.systemStatus.sensors.damaged
                                            ? '#ffaa44'
                                            : '#44ff44'}`,
                                    borderRadius: '30%',
                                    animation: engineeringState.systemStatus.sensors.criticalDamage
                                        ? 'blink 1s infinite'
                                        : engineeringState.systemStatus.sensors.damaged
                                            ? 'warningGlow 2s infinite'
                                            : 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '7px',
                                    fontWeight: 'bold',
                                    color: '#fff',
                                    textShadow: '0 0 4px rgba(0,0,0,0.8)'
                                }}
                                    onClick={() => {
                                        const assessment = assessSystemDamage('sensors');
                                        if (assessment.needsRepair) {
                                            addRepairTask('sensors', assessment.damageType!, 1);
                                        }
                                    }}
                                    title={`Sensors: ${engineeringState.systemStatus.sensors.health.toFixed(0)}% health`}
                                >
                                    SNS
                                </div>

                                {/* Life Support - Central core */}
                                <div style={{
                                    position: 'absolute',
                                    left: '45%',
                                    top: '45%',
                                    width: '10%',
                                    height: '10%',
                                    background: engineeringState.systemStatus.lifeSupport.criticalDamage
                                        ? 'rgba(255, 68, 68, 0.8)'
                                        : engineeringState.systemStatus.lifeSupport.damaged
                                            ? 'rgba(255, 170, 68, 0.6)'
                                            : 'rgba(68, 255, 68, 0.4)',
                                    border: `2px solid ${engineeringState.systemStatus.lifeSupport.criticalDamage
                                        ? '#ff4444'
                                        : engineeringState.systemStatus.lifeSupport.damaged
                                            ? '#ffaa44'
                                            : '#44ff44'}`,
                                    borderRadius: '50%',
                                    animation: engineeringState.systemStatus.lifeSupport.criticalDamage
                                        ? 'blink 0.5s infinite'
                                        : engineeringState.systemStatus.lifeSupport.damaged
                                            ? 'warningGlow 2s infinite'
                                            : 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '6px',
                                    fontWeight: 'bold',
                                    color: '#fff',
                                    textShadow: '0 0 4px rgba(0,0,0,0.8)'
                                }}
                                    onClick={() => {
                                        const assessment = assessSystemDamage('lifeSupport');
                                        if (assessment.needsRepair) {
                                            addRepairTask('lifeSupport', assessment.damageType!, 1);
                                        }
                                    }}
                                    title={`Life Support: ${engineeringState.systemStatus.lifeSupport.health.toFixed(0)}% health`}
                                >
                                    LS
                                </div>

                                {/* Communications - Top rear section */}
                                <div style={{
                                    position: 'absolute',
                                    left: '65%',
                                    top: '15%',
                                    width: '12%',
                                    height: '12%',
                                    background: engineeringState.systemStatus.communications.criticalDamage
                                        ? 'rgba(255, 68, 68, 0.7)'
                                        : engineeringState.systemStatus.communications.damaged
                                            ? 'rgba(255, 170, 68, 0.5)'
                                            : 'rgba(68, 255, 68, 0.3)',
                                    border: `2px solid ${engineeringState.systemStatus.communications.criticalDamage
                                        ? '#ff4444'
                                        : engineeringState.systemStatus.communications.damaged
                                            ? '#ffaa44'
                                            : '#44ff44'}`,
                                    borderRadius: '25%',
                                    animation: engineeringState.systemStatus.communications.criticalDamage
                                        ? 'blink 1s infinite'
                                        : engineeringState.systemStatus.communications.damaged
                                            ? 'warningGlow 2s infinite'
                                            : 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '6px',
                                    fontWeight: 'bold',
                                    color: '#fff',
                                    textShadow: '0 0 4px rgba(0,0,0,0.8)'
                                }}
                                    onClick={() => {
                                        const assessment = assessSystemDamage('communications');
                                        if (assessment.needsRepair) {
                                            addRepairTask('communications', assessment.damageType!, 1);
                                        }
                                    }}
                                    title={`Communications: ${engineeringState.systemStatus.communications.health.toFixed(0)}% health`}
                                >
                                    COM
                                </div>

                                {/* Legend */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: '5px',
                                    left: '5px',
                                    fontSize: '8px',
                                    color: '#ff8c00',
                                    background: 'rgba(0, 0, 0, 0.7)',
                                    padding: '4px',
                                    borderRadius: '2px'
                                }}>
                                    🟢 Operational | 🟡 Damaged | 🔴 Critical | Click to Repair
                                </div>
                            </div>
                        </div>

                        {/* Damage Assessment Section */}
                        <div style={{ marginBottom: '15px', padding: '8px', background: 'rgba(255, 140, 0, 0.1)', borderRadius: '4px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
                                DAMAGE ASSESSMENT
                            </div>
                            <div style={{ fontSize: '9px' }}>
                                {(() => {
                                    const prioritizedSystems = prioritizeRepairTasks();
                                    if (prioritizedSystems.length === 0) {
                                        return <div style={{ color: '#44ff44', textAlign: 'center' }}>ALL SYSTEMS OPERATIONAL</div>;
                                    }

                                    return prioritizedSystems.slice(0, 3).map(systemName => {
                                        const assessment = assessSystemDamage(systemName);
                                        const system = engineeringState.systemStatus[systemName];
                                        const hasActiveRepair = engineeringState.repairQueue.some(task => task.systemName === systemName);

                                        return (
                                            <div key={systemName} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: '4px',
                                                padding: '2px 4px',
                                                background: hasActiveRepair ? 'rgba(68, 255, 68, 0.1)' : 'rgba(255, 68, 68, 0.1)',
                                                borderRadius: '2px'
                                            }}>
                                                <span style={{ textTransform: 'uppercase' }}>
                                                    {systemName} ({system.health.toFixed(0)}%)
                                                </span>
                                                {!hasActiveRepair && assessment.needsRepair && (
                                                    <button
                                                        onClick={() => addRepairTask(systemName, assessment.damageType!, 1)}
                                                        style={{
                                                            padding: '2px 6px',
                                                            background: 'linear-gradient(45deg, #ff8c00, #ffaa44)',
                                                            border: 'none',
                                                            borderRadius: '2px',
                                                            color: '#000',
                                                            fontSize: '8px',
                                                            fontWeight: 'bold',
                                                            cursor: 'pointer',
                                                            textTransform: 'uppercase'
                                                        }}
                                                    >
                                                        Repair
                                                    </button>
                                                )}
                                                {hasActiveRepair && (
                                                    <span style={{ color: '#44ff44', fontSize: '8px' }}>IN PROGRESS</span>
                                                )}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>

                        {/* Active Repairs Section */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>
                                ACTIVE REPAIRS ({engineeringState.repairQueue.length})
                            </div>

                            {engineeringState.repairQueue.length === 0 ? (
                                <div style={{
                                    textAlign: 'center',
                                    color: '#888',
                                    fontSize: '10px',
                                    padding: '20px 0'
                                }}>
                                    No active repair tasks
                                </div>
                            ) : (
                                engineeringState.repairQueue.map((repair) => {
                                    const damageColor = repair.damageType === 'critical' ? '#ff4444' :
                                        repair.damageType === 'major' ? '#ffaa44' : '#ffff44';

                                    return (
                                        <div key={repair.id} style={{
                                            marginBottom: '12px',
                                            padding: '8px',
                                            background: `rgba(${repair.damageType === 'critical' ? '255, 68, 68' : repair.damageType === 'major' ? '255, 170, 68' : '255, 255, 68'}, 0.1)`,
                                            border: `1px solid ${damageColor}`,
                                            borderRadius: '4px'
                                        }}>
                                            {/* Repair Task Header */}
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: '6px'
                                            }}>
                                                <span style={{
                                                    fontWeight: 'bold',
                                                    textTransform: 'uppercase',
                                                    color: damageColor,
                                                    fontSize: '10px'
                                                }}>
                                                    {repair.systemName}
                                                </span>
                                                <span style={{
                                                    fontSize: '9px',
                                                    color: damageColor,
                                                    fontWeight: 'bold',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {repair.damageType}
                                                </span>
                                            </div>

                                            {/* Progress Bar */}
                                            <div style={{ marginBottom: '6px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '2px' }}>
                                                    <span>Progress</span>
                                                    <span style={{ color: '#44ff44' }}>{repair.progress.toFixed(1)}%</span>
                                                </div>
                                                <div style={{
                                                    width: '100%',
                                                    height: '4px',
                                                    background: 'rgba(0, 0, 0, 0.3)',
                                                    borderRadius: '2px',
                                                    overflow: 'hidden'
                                                }}>
                                                    <div style={{
                                                        width: `${repair.progress}%`,
                                                        height: '100%',
                                                        background: 'linear-gradient(to right, #44ff44, #44ff44aa)',
                                                        transition: 'width 0.3s ease'
                                                    }} />
                                                </div>
                                            </div>

                                            {/* Crew Assignment */}
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: '4px'
                                            }}>
                                                <span style={{ fontSize: '9px' }}>Droids Assigned:</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <button
                                                        onClick={() => updateRepairTaskDroidsSafe(repair.id, Math.max(1, repair.assignedCrew - 1))}
                                                        disabled={repair.assignedCrew <= 1}
                                                        style={{
                                                            width: '16px',
                                                            height: '16px',
                                                            background: repair.assignedCrew > 1 ? '#ff8c00' : '#444',
                                                            border: 'none',
                                                            borderRadius: '2px',
                                                            color: '#fff',
                                                            fontSize: '10px',
                                                            cursor: repair.assignedCrew > 1 ? 'pointer' : 'not-allowed',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                    >
                                                        -
                                                    </button>
                                                    <span style={{ fontSize: '10px', fontWeight: 'bold', minWidth: '12px', textAlign: 'center' }}>
                                                        {repair.assignedCrew}
                                                    </span>
                                                    <button
                                                        onClick={() => {
                                                            const newDroidCount = repair.assignedCrew + 1;
                                                            const validation = validateDroidAssignment(repair.id, newDroidCount);
                                                            if (validation.valid) {
                                                                updateRepairTaskDroidsSafe(repair.id, newDroidCount);
                                                            }
                                                        }}
                                                        disabled={(() => {
                                                            const newDroidCount = repair.assignedCrew + 1;
                                                            const validation = validateDroidAssignment(repair.id, newDroidCount);
                                                            return !validation.valid;
                                                        })()}
                                                        style={{
                                                            width: '16px',
                                                            height: '16px',
                                                            background: (() => {
                                                                const newDroidCount = repair.assignedCrew + 1;
                                                                const validation = validateDroidAssignment(repair.id, newDroidCount);
                                                                return validation.valid ? '#ff8c00' : '#444';
                                                            })(),
                                                            border: 'none',
                                                            borderRadius: '2px',
                                                            color: '#fff',
                                                            fontSize: '10px',
                                                            cursor: (() => {
                                                                const newDroidCount = repair.assignedCrew + 1;
                                                                const validation = validateDroidAssignment(repair.id, newDroidCount);
                                                                return validation.valid ? 'pointer' : 'not-allowed';
                                                            })(),
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Repair Details */}
                                            <div style={{ fontSize: '8px', color: '#888' }}>
                                                <div>Time: {Math.floor(repair.timeRequired / 60)}:{(repair.timeRequired % 60).toString().padStart(2, '0')}</div>
                                                <div>Difficulty: {repair.difficulty}</div>
                                                {repair.juryRigged && <div style={{ color: '#ffaa44' }}>JURY-RIGGED</div>}
                                            </div>

                                            {/* Action Buttons */}
                                            <div style={{
                                                display: 'flex',
                                                gap: '4px',
                                                marginTop: '6px'
                                            }}>
                                                <button
                                                    onClick={() => removeRepairTask(repair.id)}
                                                    style={{
                                                        flex: 1,
                                                        padding: '4px',
                                                        background: 'linear-gradient(45deg, #ff4444, #ff6666)',
                                                        border: 'none',
                                                        borderRadius: '2px',
                                                        color: '#fff',
                                                        fontSize: '8px',
                                                        fontWeight: 'bold',
                                                        cursor: 'pointer',
                                                        textTransform: 'uppercase'
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                                {!repair.juryRigged && (
                                                    <button
                                                        onClick={() => {
                                                            // Toggle jury-rig status
                                                            setEngineeringState(prev => ({
                                                                ...prev,
                                                                repairQueue: prev.repairQueue.map(task =>
                                                                    task.id === repair.id
                                                                        ? { ...task, juryRigged: true, timeRequired: Math.round(task.timeRequired * 0.5) }
                                                                        : task
                                                                )
                                                            }));
                                                        }}
                                                        style={{
                                                            flex: 1,
                                                            padding: '4px',
                                                            background: 'linear-gradient(45deg, #ffaa44, #ffcc66)',
                                                            border: 'none',
                                                            borderRadius: '2px',
                                                            color: '#000',
                                                            fontSize: '8px',
                                                            fontWeight: 'bold',
                                                            cursor: 'pointer',
                                                            textTransform: 'uppercase'
                                                        }}
                                                    >
                                                        Jury-Rig
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Emergency Controls Panel */}
                <div style={getPanelStyle(getEmergencyStatus().level === 'red' ? 'critical' : getEmergencyStatus().level === 'yellow' ? 'warning' : 'none')} className="engineering-panel">
                    <h3 style={panelTitleStyle}>EMERGENCY CONTROLS</h3>
                    <div style={{ color: '#ff8c00', fontSize: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}>

                        {/* Emergency Status Indicator */}
                        <div style={{ marginBottom: '15px', padding: '8px', background: 'rgba(255, 68, 68, 0.1)', borderRadius: '4px', border: '2px solid #ff4444' }}>
                            {(() => {
                                const emergencyStatus = getEmergencyStatus();
                                const statusColor = emergencyStatus.level === 'red' ? '#ff4444' :
                                    emergencyStatus.level === 'yellow' ? '#ffaa44' : '#44ff44';

                                return (
                                    <>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '6px'
                                        }}>
                                            <span style={{ fontSize: '10px', fontWeight: 'bold' }}>SHIP STATUS</span>
                                            <span style={{
                                                fontSize: '10px',
                                                fontWeight: 'bold',
                                                color: statusColor,
                                                animation: emergencyStatus.level === 'red' ? 'blink 1s infinite' : 'none'
                                            }}>
                                                {emergencyStatus.level === 'red' ? '🚨 CRITICAL' :
                                                    emergencyStatus.level === 'yellow' ? '⚠️ WARNING' : '✅ NOMINAL'}
                                            </span>
                                        </div>

                                        {emergencyStatus.criticalSystems.length > 0 && (
                                            <div style={{ fontSize: '9px', color: '#ff4444', marginBottom: '4px' }}>
                                                Critical: {emergencyStatus.criticalSystems.join(', ')}
                                            </div>
                                        )}

                                        {emergencyStatus.warnings.length > 0 && (
                                            <div style={{ fontSize: '9px', color: '#ffaa44' }}>
                                                {emergencyStatus.warnings.map((warning, index) => (
                                                    <div key={index}>{warning}</div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        {/* Emergency Procedures Status */}
                        <div style={{ marginBottom: '15px', padding: '6px', background: 'rgba(255, 140, 0, 0.1)', borderRadius: '4px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
                                ACTIVE PROCEDURES
                            </div>
                            <div style={{ fontSize: '9px' }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: '2px',
                                    color: engineeringState.emergencyProcedures.emergencyPowerActive ? '#ff4444' : '#888'
                                }}>
                                    <span>Emergency Power:</span>
                                    <span>{engineeringState.emergencyProcedures.emergencyPowerActive ? 'ACTIVE' : 'STANDBY'}</span>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: '2px',
                                    color: engineeringState.emergencyProcedures.emergencyShutdownActive ? '#ff4444' : '#888'
                                }}>
                                    <span>Emergency Shutdown:</span>
                                    <span>{engineeringState.emergencyProcedures.emergencyShutdownActive ? 'ACTIVE' : 'STANDBY'}</span>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    color: engineeringState.emergencyProcedures.lifeSupportPriority ? '#44ff44' : '#888'
                                }}>
                                    <span>Life Support Priority:</span>
                                    <span>{engineeringState.emergencyProcedures.lifeSupportPriority ? 'ACTIVE' : 'STANDBY'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Emergency Action Buttons */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>

                            {/* Master Emergency Protocol */}
                            <button
                                onClick={() => {
                                    if (window.confirm('⚠️ ACTIVATE ALL EMERGENCY PROTOCOLS?\n\nThis will:\n- Activate emergency power\n- Prioritize life support\n- Begin emergency repairs on critical systems\n\nConfirm?')) {
                                        activateEmergencyProtocols();
                                    }
                                }}
                                style={{
                                    padding: '12px',
                                    background: 'linear-gradient(45deg, #ff4444, #ff6666)',
                                    border: '2px solid #ff4444',
                                    borderRadius: '4px',
                                    color: '#fff',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    boxShadow: '0 0 10px rgba(255, 68, 68, 0.5)',
                                    animation: getEmergencyStatus().level === 'red' ? 'blink 2s infinite' : 'none'
                                }}
                            >
                                🚨 EMERGENCY PROTOCOLS
                            </button>

                            {/* Individual Emergency Controls */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>

                                {/* Life Support Priority */}
                                <button
                                    onClick={() => {
                                        if (!engineeringState.emergencyProcedures.lifeSupportPriority) {
                                            if (window.confirm('Activate Life Support Priority?\n\nThis will redirect 40% of available power to life support systems.')) {
                                                activateLifeSupportPriority();
                                            }
                                        } else {
                                            activateLifeSupportPriority();
                                        }
                                    }}
                                    style={{
                                        padding: '8px',
                                        background: engineeringState.emergencyProcedures.lifeSupportPriority
                                            ? 'linear-gradient(45deg, #44ff44, #66ff66)'
                                            : 'linear-gradient(45deg, #666, #888)',
                                        border: `2px solid ${engineeringState.emergencyProcedures.lifeSupportPriority ? '#44ff44' : '#888'}`,
                                        borderRadius: '4px',
                                        color: engineeringState.emergencyProcedures.lifeSupportPriority ? '#000' : '#fff',
                                        fontSize: '9px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        textTransform: 'uppercase',
                                        textAlign: 'center',
                                        boxShadow: engineeringState.emergencyProcedures.lifeSupportPriority
                                            ? '0 0 8px rgba(68, 255, 68, 0.5)'
                                            : 'none'
                                    }}
                                >
                                    Life Support<br />Priority
                                </button>

                                {/* Emergency Shutdown */}
                                <button
                                    onClick={() => {
                                        const criticalSystems = Object.entries(engineeringState.systemStatus)
                                            .filter(([, status]) => status.criticalDamage)
                                            .map(([name]) => name);

                                        if (criticalSystems.length > 0) {
                                            const systemToShutdown = criticalSystems[0]; // Shutdown first critical system
                                            if (window.confirm(`Emergency shutdown ${systemToShutdown}?\n\nThis will completely power down the system to prevent further damage.`)) {
                                                activateEmergencyShutdown(systemToShutdown);
                                            }
                                        } else {
                                            alert('No critical systems requiring emergency shutdown.');
                                        }
                                    }}
                                    style={{
                                        padding: '8px',
                                        background: engineeringState.emergencyProcedures.emergencyShutdownActive
                                            ? 'linear-gradient(45deg, #ff4444, #ff6666)'
                                            : 'linear-gradient(45deg, #666, #888)',
                                        border: `2px solid ${engineeringState.emergencyProcedures.emergencyShutdownActive ? '#ff4444' : '#888'}`,
                                        borderRadius: '4px',
                                        color: '#fff',
                                        fontSize: '9px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        textTransform: 'uppercase',
                                        textAlign: 'center',
                                        boxShadow: engineeringState.emergencyProcedures.emergencyShutdownActive
                                            ? '0 0 8px rgba(255, 68, 68, 0.5)'
                                            : 'none'
                                    }}
                                >
                                    Emergency<br />Shutdown
                                </button>
                            </div>

                            {/* Emergency Repair Buttons */}
                            <div style={{ marginTop: '8px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
                                    EMERGENCY REPAIRS
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                                    {Object.entries(engineeringState.systemStatus)
                                        .filter(([, status]) => status.damaged)
                                        .slice(0, 6) // Show max 6 systems
                                        .map(([systemName, status]) => {
                                            const hasActiveRepair = engineeringState.repairQueue.some(task => task.systemName === systemName);
                                            const buttonColor = status.criticalDamage ? '#ff4444' : '#ffaa44';

                                            return (
                                                <button
                                                    key={systemName}
                                                    onClick={() => {
                                                        if (!hasActiveRepair) {
                                                            if (window.confirm(`Start emergency repair on ${systemName}?\n\nThis will be faster but less effective than normal repairs.`)) {
                                                                performEmergencyRepair(systemName);
                                                            }
                                                        }
                                                    }}
                                                    disabled={hasActiveRepair}
                                                    style={{
                                                        padding: '4px 2px',
                                                        background: hasActiveRepair
                                                            ? 'linear-gradient(45deg, #44ff44, #66ff66)'
                                                            : `linear-gradient(45deg, ${buttonColor}, ${buttonColor}aa)`,
                                                        border: 'none',
                                                        borderRadius: '2px',
                                                        color: hasActiveRepair ? '#000' : '#fff',
                                                        fontSize: '7px',
                                                        fontWeight: 'bold',
                                                        cursor: hasActiveRepair ? 'not-allowed' : 'pointer',
                                                        textTransform: 'uppercase',
                                                        textAlign: 'center'
                                                    }}
                                                >
                                                    {systemName.substr(0, 4)}
                                                    <br />
                                                    {hasActiveRepair ? 'ACTIVE' : 'REPAIR'}
                                                </button>
                                            );
                                        })}
                                </div>
                            </div>
                        </div>

                        {/* Emergency Reset */}
                        <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                            <button
                                onClick={() => {
                                    if (window.confirm('Deactivate all emergency procedures?\n\nThis will return all systems to normal operation.')) {
                                        deactivateAllEmergencyProcedures();
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '6px',
                                    background: 'linear-gradient(45deg, #888, #aaa)',
                                    border: '1px solid #888',
                                    borderRadius: '4px',
                                    color: '#000',
                                    fontSize: '9px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase'
                                }}
                            >
                                Reset All Emergency Procedures
                            </button>
                        </div>
                    </div>
                </div>

                {/* System Boost Panel */}
                <div style={getPanelStyle('none')} className="engineering-panel">
                    <h3 style={panelTitleStyle}>SYSTEM BOOSTS</h3>
                    <div style={{ color: '#ff8c00', fontSize: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}>

                        {/* Active Boosts Section */}
                        <div style={{ marginBottom: '15px', padding: '8px', background: 'rgba(255, 140, 0, 0.1)', borderRadius: '4px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
                                ACTIVE BOOSTS ({engineeringState.activeBoosts.length})
                            </div>

                            {engineeringState.activeBoosts.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#888', fontSize: '9px' }}>
                                    No active system boosts
                                </div>
                            ) : (
                                <div style={{ maxHeight: '80px', overflowY: 'auto' }}>
                                    {engineeringState.activeBoosts.map((boost) => {
                                        const boostColor = boost.boostType === 'performance' ? '#44ff44' :
                                            boost.boostType === 'efficiency' ? '#44ffff' : '#ffff44';
                                        const timePercent = (boost.timeRemaining / boost.duration) * 100;

                                        return (
                                            <div key={boost.id} style={{
                                                marginBottom: '6px',
                                                padding: '4px',
                                                background: `rgba(${boost.boostType === 'performance' ? '68, 255, 68' : boost.boostType === 'efficiency' ? '68, 255, 255' : '255, 255, 68'}, 0.1)`,
                                                border: `1px solid ${boostColor}`,
                                                borderRadius: '2px'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                    <span style={{ fontSize: '9px', textTransform: 'uppercase', color: boostColor }}>
                                                        {boost.systemName}
                                                    </span>
                                                    <button
                                                        onClick={() => removeSystemBoost(boost.id)}
                                                        style={{
                                                            width: '12px',
                                                            height: '12px',
                                                            background: '#ff4444',
                                                            border: 'none',
                                                            borderRadius: '2px',
                                                            color: '#fff',
                                                            fontSize: '8px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                                <div style={{ fontSize: '8px', marginBottom: '2px' }}>
                                                    {boost.boostType.toUpperCase()} +{boost.magnitude}
                                                </div>
                                                <div style={{ fontSize: '8px', marginBottom: '2px' }}>
                                                    {Math.floor(boost.timeRemaining / 60)}:{(boost.timeRemaining % 60).toString().padStart(2, '0')}
                                                </div>
                                                <div style={{
                                                    width: '100%',
                                                    height: '2px',
                                                    background: 'rgba(0, 0, 0, 0.3)',
                                                    borderRadius: '1px',
                                                    overflow: 'hidden'
                                                }}>
                                                    <div style={{
                                                        width: `${timePercent}%`,
                                                        height: '100%',
                                                        background: boostColor,
                                                        transition: 'width 1s linear'
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Available Boosts Section */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>
                                AVAILABLE BOOSTS
                            </div>

                            {Object.keys(engineeringState.systemStatus).map(systemName => {
                                const system = engineeringState.systemStatus[systemName];
                                const boostEffects = calculateBoostEffects(systemName);
                                const availableBoosts = getAvailableBoosts(systemName);
                                const hasAvailableBoosts = availableBoosts.some(boost => boost.canApply);

                                if (!hasAvailableBoosts && boostEffects.performanceBonus === 0 && boostEffects.efficiencyBonus === 0 && boostEffects.outputBonus === 0) {
                                    return null; // Skip systems with no available boosts and no active effects
                                }

                                return (
                                    <div key={systemName} style={{
                                        marginBottom: '12px',
                                        padding: '6px',
                                        background: 'rgba(255, 140, 0, 0.05)',
                                        border: '1px solid #ff8c00',
                                        borderRadius: '4px'
                                    }}>
                                        {/* System Header */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '4px'
                                        }}>
                                            <span style={{
                                                fontWeight: 'bold',
                                                textTransform: 'uppercase',
                                                fontSize: '10px'
                                            }}>
                                                {systemName}
                                            </span>
                                            <span style={{
                                                fontSize: '8px',
                                                color: system.strain > 80 ? '#ff4444' : system.strain > 50 ? '#ffaa44' : '#44ff44'
                                            }}>
                                                {system.strain.toFixed(0)}% strain
                                            </span>
                                        </div>

                                        {/* Current Boost Effects */}
                                        {(boostEffects.performanceBonus > 0 || boostEffects.efficiencyBonus > 0 || boostEffects.outputBonus > 0) && (
                                            <div style={{ fontSize: '8px', marginBottom: '4px', color: '#44ff44' }}>
                                                {boostEffects.performanceBonus > 0 && <div>Performance: +{boostEffects.performanceBonus}%</div>}
                                                {boostEffects.efficiencyBonus > 0 && <div>Efficiency: +{boostEffects.efficiencyBonus}%</div>}
                                                {boostEffects.outputBonus > 0 && <div>Output: +{boostEffects.outputBonus}%</div>}
                                            </div>
                                        )}

                                        {/* Boost Type Buttons */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px' }}>
                                            {['performance', 'efficiency', 'output'].map(boostType => {
                                                const boost = availableBoosts.find(b => b.boostType === boostType && b.magnitude === 1);
                                                const canApply = boost?.canApply || false;
                                                const strainCost = calculateBoostStrainCost(systemName, boostType as 'performance' | 'efficiency' | 'output', 1);
                                                const boostColor = boostType === 'performance' ? '#44ff44' :
                                                    boostType === 'efficiency' ? '#44ffff' : '#ffff44';

                                                return (
                                                    <button
                                                        key={boostType}
                                                        onClick={() => canApply && applySystemBoost(systemName, boostType as 'performance' | 'efficiency' | 'output', 1)}
                                                        disabled={!canApply}
                                                        style={{
                                                            padding: '4px 2px',
                                                            background: canApply ? `linear-gradient(45deg, ${boostColor}, ${boostColor}aa)` : '#444',
                                                            border: 'none',
                                                            borderRadius: '2px',
                                                            color: canApply ? '#000' : '#888',
                                                            fontSize: '7px',
                                                            fontWeight: 'bold',
                                                            cursor: canApply ? 'pointer' : 'not-allowed',
                                                            textTransform: 'uppercase',
                                                            textAlign: 'center'
                                                        }}
                                                        title={canApply ? `${boostType.toUpperCase()} +1 (${strainCost} strain)` : boost?.reason}
                                                    >
                                                        {boostType.substr(0, 4)}
                                                        <br />
                                                        +1
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Magnitude Selection for Available Boosts */}
                                        {hasAvailableBoosts && (
                                            <div style={{ marginTop: '4px' }}>
                                                <div style={{ fontSize: '8px', color: '#888', marginBottom: '2px' }}>
                                                    Magnitude:
                                                </div>
                                                <div style={{ display: 'flex', gap: '2px' }}>
                                                    {[1, 2, 3].map(magnitude => {
                                                        const performanceBoost = availableBoosts.find(b => b.boostType === 'performance' && b.magnitude === magnitude);
                                                        const canApplyAny = performanceBoost?.canApply ||
                                                            availableBoosts.find(b => b.boostType === 'efficiency' && b.magnitude === magnitude)?.canApply ||
                                                            availableBoosts.find(b => b.boostType === 'output' && b.magnitude === magnitude)?.canApply;

                                                        return (
                                                            <div key={magnitude} style={{
                                                                padding: '2px 4px',
                                                                background: canApplyAny ? 'rgba(255, 140, 0, 0.2)' : 'rgba(68, 68, 68, 0.2)',
                                                                border: `1px solid ${canApplyAny ? '#ff8c00' : '#444'}`,
                                                                borderRadius: '2px',
                                                                fontSize: '7px',
                                                                color: canApplyAny ? '#ff8c00' : '#888',
                                                                textAlign: 'center'
                                                            }}>
                                                                {magnitude}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Boost Presets Section */}
                        <div style={{
                            marginTop: 'auto',
                            padding: '6px',
                            background: 'rgba(255, 140, 0, 0.1)',
                            borderRadius: '4px',
                            border: '1px solid #ff8c00'
                        }}>
                            <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>
                                QUICK PRESETS
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                <button
                                    onClick={() => {
                                        // Combat preset: boost weapons and shields
                                        applySystemBoost('weapons', 'output', 1);
                                        applySystemBoost('shields', 'efficiency', 1);
                                    }}
                                    style={{
                                        padding: '4px',
                                        background: 'linear-gradient(45deg, #ff4444, #ff6666)',
                                        border: 'none',
                                        borderRadius: '2px',
                                        color: '#fff',
                                        fontSize: '8px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    Combat
                                </button>
                                <button
                                    onClick={() => {
                                        // Speed preset: boost engines and sensors
                                        applySystemBoost('engines', 'performance', 1);
                                        applySystemBoost('sensors', 'efficiency', 1);
                                    }}
                                    style={{
                                        padding: '4px',
                                        background: 'linear-gradient(45deg, #44ff44, #66ff66)',
                                        border: 'none',
                                        borderRadius: '2px',
                                        color: '#000',
                                        fontSize: '8px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    Speed
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Diagnostics Panel */}
                <div style={getPanelStyle('none')} className="engineering-panel">
                    <h3 style={panelTitleStyle}>DIAGNOSTICS</h3>
                    <div style={{ color: '#ff8c00', fontSize: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}>

                        {/* Predictive Alerts Section */}
                        <div style={{ marginBottom: '15px', padding: '8px', background: 'rgba(255, 140, 0, 0.1)', borderRadius: '4px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
                                PREDICTIVE ALERTS ({predictiveAlerts.length})
                            </div>

                            {predictiveAlerts.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#44ff44', fontSize: '9px' }}>
                                    No maintenance alerts
                                </div>
                            ) : (
                                <div style={{ maxHeight: '80px', overflowY: 'auto' }}>
                                    {predictiveAlerts.slice(0, 3).map((alert) => {
                                        const alertColor = alert.severity === 'high' ? '#ff4444' :
                                            alert.severity === 'medium' ? '#ffaa44' : '#ffff44';

                                        return (
                                            <div key={alert.id} style={{
                                                marginBottom: '4px',
                                                padding: '4px',
                                                background: `rgba(${alert.severity === 'high' ? '255, 68, 68' : alert.severity === 'medium' ? '255, 170, 68' : '255, 255, 68'}, 0.1)`,
                                                border: `1px solid ${alertColor}`,
                                                borderRadius: '2px'
                                            }}>
                                                <div style={{ fontSize: '8px', color: alertColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                                    {alert.systemName} - {alert.severity}
                                                </div>
                                                <div style={{ fontSize: '8px', color: '#fff' }}>
                                                    {alert.message}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* System Scans Section */}
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
                                SYSTEM SCANS
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                                {Object.keys(engineeringState.systemStatus).slice(0, 6).map(systemName => {
                                    const scan = diagnosticScans[systemName];
                                    const isScanning = scan?.scanning || false;
                                    const hasResults = scan?.results !== undefined;

                                    return (
                                        <button
                                            key={systemName}
                                            onClick={() => !isScanning && performSystemScan(systemName, 'basic')}
                                            disabled={isScanning}
                                            style={{
                                                padding: '4px 2px',
                                                background: isScanning
                                                    ? 'linear-gradient(45deg, #ffaa44, #ffcc66)'
                                                    : hasResults
                                                        ? 'linear-gradient(45deg, #44ff44, #66ff66)'
                                                        : 'linear-gradient(45deg, #666, #888)',
                                                border: 'none',
                                                borderRadius: '2px',
                                                color: isScanning || hasResults ? '#000' : '#fff',
                                                fontSize: '7px',
                                                fontWeight: 'bold',
                                                cursor: isScanning ? 'not-allowed' : 'pointer',
                                                textTransform: 'uppercase',
                                                textAlign: 'center'
                                            }}
                                        >
                                            {systemName.substr(0, 4)}
                                            <br />
                                            {isScanning ? `${scan.progress.toFixed(0)}%` : hasResults ? 'DONE' : 'SCAN'}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Scan Type Selector */}
                            <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
                                {['basic', 'deep', 'comprehensive'].map(scanType => (
                                    <button
                                        key={scanType}
                                        onClick={() => {
                                            const availableSystems = Object.keys(engineeringState.systemStatus).filter(
                                                name => !diagnosticScans[name]?.scanning
                                            );
                                            if (availableSystems.length > 0) {
                                                performSystemScan(availableSystems[0], scanType as 'basic' | 'deep' | 'comprehensive');
                                            }
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '4px',
                                            background: 'linear-gradient(45deg, #ff8c00, #ffaa44)',
                                            border: 'none',
                                            borderRadius: '2px',
                                            color: '#000',
                                            fontSize: '8px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            textTransform: 'uppercase'
                                        }}
                                    >
                                        {scanType}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Performance Analysis Section */}
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
                                PERFORMANCE ANALYSIS
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                {Object.keys(engineeringState.systemStatus).slice(0, 4).map(systemName => {
                                    const analysis = analyzeSystemPerformance(systemName, 300); // 5 minute analysis
                                    const trendColor = analysis.status === 'analysis_complete'
                                        ? (analysis.trends?.health === 'improving' ? '#44ff44' :
                                            analysis.trends?.health === 'declining' ? '#ff4444' : '#ffaa44')
                                        : '#888';

                                    return (
                                        <div key={systemName} style={{
                                            padding: '4px',
                                            background: 'rgba(255, 140, 0, 0.05)',
                                            border: '1px solid #ff8c00',
                                            borderRadius: '2px'
                                        }}>
                                            <div style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>
                                                {systemName.substr(0, 6)}
                                            </div>
                                            {analysis.status === 'analysis_complete' ? (
                                                <>
                                                    <div style={{ fontSize: '7px', color: trendColor }}>
                                                        Health: {analysis.trends?.health}
                                                    </div>
                                                    <div style={{ fontSize: '7px' }}>
                                                        Avg: {analysis.averages?.health.toFixed(0)}%
                                                    </div>
                                                </>
                                            ) : (
                                                <div style={{ fontSize: '7px', color: '#888' }}>
                                                    Insufficient data
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* System Calibration Section */}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
                                SYSTEM CALIBRATION
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px', marginBottom: '8px' }}>
                                {['efficiency', 'power', 'thermal'].map(calibrationType => (
                                    <button
                                        key={calibrationType}
                                        onClick={() => {
                                            // Calibrate the system with highest strain
                                            const systemsToCalibrate = Object.entries(engineeringState.systemStatus)
                                                .filter(([, status]) => !status.criticalDamage)
                                                .sort(([, a], [, b]) => b.strain - a.strain);

                                            if (systemsToCalibrate.length > 0) {
                                                performSystemCalibration(systemsToCalibrate[0][0], calibrationType as 'efficiency' | 'power' | 'thermal');
                                            }
                                        }}
                                        style={{
                                            padding: '4px 2px',
                                            background: 'linear-gradient(45deg, #44ffff, #66ffff)',
                                            border: 'none',
                                            borderRadius: '2px',
                                            color: '#000',
                                            fontSize: '7px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            textTransform: 'uppercase',
                                            textAlign: 'center'
                                        }}
                                    >
                                        {calibrationType.substr(0, 4)}
                                        <br />
                                        CAL
                                    </button>
                                ))}
                            </div>

                            {/* Scan Results Display */}
                            {(() => {
                                const systemsWithResults = Object.entries(diagnosticScans).filter(([, scan]) => scan.results);
                                if (systemsWithResults.length === 0) return null;

                                const [systemName, scan] = systemsWithResults[systemsWithResults.length - 1]; // Show latest scan
                                const results = scan.results;

                                return (
                                    <div style={{
                                        marginTop: '8px',
                                        padding: '6px',
                                        background: 'rgba(68, 255, 68, 0.1)',
                                        border: '1px solid #44ff44',
                                        borderRadius: '4px',
                                        maxHeight: '120px',
                                        overflowY: 'auto'
                                    }}>
                                        <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '4px', color: '#44ff44' }}>
                                            LATEST SCAN: {systemName.toUpperCase()}
                                        </div>
                                        <div style={{ fontSize: '8px' }}>
                                            <div>Status: {results.overallStatus}</div>
                                            <div>Health: {results.health.toFixed(1)}%</div>
                                            <div>Efficiency: {results.efficiency.toFixed(1)}%</div>
                                            <div>Strain: {results.strain.toFixed(1)}%</div>

                                            {results.recommendations && results.recommendations.length > 0 && (
                                                <div style={{ marginTop: '4px' }}>
                                                    <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#ffaa44' }}>
                                                        Recommendations:
                                                    </div>
                                                    {results.recommendations.slice(0, 2).map((rec: string, index: number) => (
                                                        <div key={index} style={{ fontSize: '7px', color: '#ffaa44' }}>
                                                            • {rec}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {results.predictedFailures && results.predictedFailures.length > 0 && (
                                                <div style={{ marginTop: '4px' }}>
                                                    <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#ff4444' }}>
                                                        Failure Predictions:
                                                    </div>
                                                    {results.predictedFailures.slice(0, 1).map((pred: any, index: number) => (
                                                        <div key={index} style={{ fontSize: '7px', color: '#ff4444' }}>
                                                            • {pred.component}: {pred.probability.toFixed(0)}% ({pred.timeframe})
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EngineeringStation;