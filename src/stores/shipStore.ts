import { Socket } from 'socket.io-client';

// Ship type definition
export type Ship = {
  id: string;
  designation: string | null;
  status: 'Active' | 'Inactive';
  entryTime: number;
  type: 'transient' | 'regular' | 'persistent';
  age: number;
  groupId?: string;
};

// Ship store class for centralized ship management
export class ShipStore {
  private ships: Ship[] = [];
  private pinnedShips: Record<string, 'white' | 'red'> = {};
  private doublePinnedShipId: string | null = null;
  private currentRegion: 'Core Worlds' | 'Colonies' | 'Inner Rim' | 'Mid Rim' | 'Outer Rim' | 'Wild Space' | 'Unknown Regions' = 'Core Worlds';
  private listeners: Set<() => void> = new Set();
  private socket: Socket | null = null;
  private room: string = 'default';

  // Organization list for ship designations
  private readonly ORGANIZATIONS = [
    "Imperial Galactic Governance Authority",
    "Imperial Security & Intelligence Directorate",
    "Imperial Inquisitorial Command",
    "Sith High Command",
    "Gerrera Resistance Movement",
    "Mandalorian Death Watch",
    "Mandalorian Children's Watch",
    "Mandalorian Clan Alliance",
    "Local Swoop Gang Networks",
    "Hutt Cartel Crime Syndicate",
    "Black Sun Criminal Enterprise",
    "Pyke Syndicate Operations",
    "Shadow Collective Alliance",
    "Crymorah Syndicate Network",
    "Zygerrian Slave Trade Empire",
    "Kintan Striders Mercenary Group",
    "Car'das Smuggling Consortium",
    "Bounty Hunters' Guild Network",
    "Czerka Arms Manufacturing",
    "BlasTech Industrial Systems",
    "Merr-Sonn Defense Solutions",
    "Arakyd Industrial Technologies",
    "Industrial Automaton Droidworks",
    "Baktoid Combat Systems",
    "Colla Design Collective",
    "Tagge Industrial Mining Group",
    "Techno Union Conglomerate",
    "Haor Chall Engineering Corps",
    "Santhe-Sienar Technologies Group",
    "Sienar Fleet Systems Division",
    "Kuat Drive Yards Shipbuilding",
    "Kuat Systems Engineering Division",
    "Rendili StarDrive Corporation",
    "Corellian Engineering Works",
    "Cygnus Spaceworks Limited",
    "Loramarr Shipyards Consortium",
    "Trade Federation Commerce Authority",
    "InterGalactic Banking Federation",
    "Corporate Alliance Board",
    "Commerce Guild Trading Authority",
    "Commerce Guild Executive Council",
    "Mining Guild Extraction Services",
    "Commerce Guild Security Forces",
    "Arcona Mineral Resources Group",
    "Dorvalla Mining Operations",
    "Offworld Mining Corporation",
    "SoroSuub Industrial Group",
    "Commerce Guild Financial Services",
    "Commerce Guild Arbitration Bureau",
    "Kelris Industrial Tools & Supplies",
    "Koensayr Equipment Distribution",
    "Blarn Heavy Industrial Exchange",
    "Reelo Modular Systems",
    "Vyndra Commercial Trade Centers",
    "Foshan Starport Retail Network",
    "Crionex Consumer Markets",
    "Qiraal Metalworks & Fabrication",
    "Molvar Field Equipment Services",
    "Polis Massa Scientific Procurement",
    "Yarith Galactic Logistics",
    "Caduceus Shipping Network",
    "Dressem Cargo Systems",
    "Trandoshan StarLift Services",
    "Vandelhelm Bulk Transport",
    "Yag'Dhul Route Navigation",
    "Ylesia Freight Cooperative",
    "Entralla Standard Shipping",
    "Skako HydroLift Services",
    "Bespin Tibanna Gas Solutions",
    "Gentes ForgeFuel Refineries",
    "Abhean Fuel Distribution",
    "Kwenn Station Maintenance",
    "Neimoidian Trade Commission",
    "Zeltros Business Arbitration",
    "Muunilinst Financial Compliance",
    "Guild Standard Hostel Network",
    "Bonadan MealStation Franchise",
    "No Registered Designation"
  ];

  constructor() {
    this.generateInitialShips();
    this.startUpdateLoop();
  }

  // Initialize socket connection
  setSocket(socket: Socket | null, room: string = 'default') {
    this.socket = socket;
    this.room = room;
    this.broadcastShipData();
  }

  // Subscribe to ship data changes
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners of changes
  private notifyListeners() {
    this.listeners.forEach(listener => listener());
    this.broadcastShipData();
  }

  // Get current ship data
  getShips(): Ship[] {
    return [...this.ships];
  }

  getPinnedShips(): Record<string, 'white' | 'red'> {
    return { ...this.pinnedShips };
  }

  getDoublePinnedShipId(): string | null {
    return this.doublePinnedShipId;
  }

  getCurrentRegion(): string {
    return this.currentRegion;
  }

  // Update pinned ships
  setPinnedShips(pinnedShips: Record<string, 'white' | 'red'>) {
    this.pinnedShips = { ...pinnedShips };
    this.notifyListeners();
  }

  // Update double pinned ship
  setDoublePinnedShipId(shipId: string | null) {
    this.doublePinnedShipId = shipId;
    this.notifyListeners();
  }

  // Update current region
  setCurrentRegion(region: 'Core Worlds' | 'Colonies' | 'Inner Rim' | 'Mid Rim' | 'Outer Rim' | 'Wild Space' | 'Unknown Regions') {
    this.currentRegion = region;
    this.generateInitialShips(); // Regenerate ships for new region
    this.notifyListeners();
  }

  // Generate initial ships using Poisson distribution
  private generateInitialShips() {
    const params = this.calculateShipCount();
    const count = Math.max(0, Math.round(params.target + (Math.random() - 0.5) * params.target * 0.3));
    this.ships = Array.from({ length: count }, () => this.createShip([]));
    this.notifyListeners();
  }

  // Create a new ship
  private createShip(existingShips: Ship[] = []): Ship {
    // Determine ship type with weighted probabilities
    const typeRoll = Math.random();
    let type: 'transient' | 'regular' | 'persistent';

    if (typeRoll < 0.6) {
      type = 'transient';  // 60% chance - short-lived
    } else if (typeRoll < 0.95) {
      type = 'regular';    // 35% chance - medium-lived
    } else {
      type = 'persistent'; // 5% chance - long-lived
    }

    // 30% chance to be in a convoy group
    let groupId: string | undefined;
    if (Math.random() < 0.3) {
      // Check existing ships for possible grouping
      if (existingShips.length > 0 && Math.random() < 0.7) {
        const existingGroups = Array.from(new Set(
          existingShips.map(s => s.groupId).filter((g): g is string => g !== undefined)
        ));
        groupId = existingGroups.length > 0
          ? existingGroups[Math.floor(Math.random() * existingGroups.length)]
          : `convoy-${Date.now()}-${Math.random()}`;
      } else {
        groupId = `convoy-${Date.now()}-${Math.random()}`;
      }
    }

    return {
      id: `${Date.now()}-${Math.random()}`,
      designation: Math.random() < 0.77 ?
        this.ORGANIZATIONS[Math.floor(Math.random() * this.ORGANIZATIONS.length)] :
        null,
      status: Math.random() < 0.7 ? 'Active' : 'Inactive',
      entryTime: Date.now(),
      type,
      age: 0,
      groupId
    };
  }

  // Calculate region-specific ship parameters
  private calculateShipCount(): { lambda: number; target: number } {
    const regionParams = {
      'Core Worlds': { lambda: 25, target: 250 },
      'Colonies': { lambda: 12.5, target: 125 },
      'Inner Rim': { lambda: 5.2, target: 52 },
      'Mid Rim': { lambda: 1.5, target: 15 },
      'Outer Rim': { lambda: 0.4, target: 4 },
      'Wild Space': { lambda: 0.1, target: 1 },
      'Unknown Regions': { lambda: 0.05, target: 0.5 }
    };
    return regionParams[this.currentRegion];
  }

  // Get base departure probability for ship type
  private getBaseDepartureProbability(shipType: 'transient' | 'regular' | 'persistent'): number {
    const departureProbabilities = {
      transient: 0.3,
      regular: 0.1,
      persistent: 0.01
    };
    return departureProbabilities[shipType];
  }

  // Toggle ship status randomly
  private toggleStatusRandomly(ship: Ship): Ship {
    if (Math.random() < 0.05) { // 5% chance to toggle status
      return {
        ...ship,
        status: ship.status === 'Active' ? 'Inactive' : 'Active'
      };
    }
    return ship;
  }

  // Update ship list (called periodically)
  private updateShipList() {
    // Age existing ships
    const agedShips = this.ships.map(ship => ({
      ...ship,
      age: ship.age + 1
    }));

    // Track departing convoy groups
    const departingGroups = new Set<string>();

    // Identify ships that want to depart
    agedShips.forEach(ship => {
      if (this.pinnedShips[ship.id]) return; // Skip pinned ships

      const baseProbability = this.getBaseDepartureProbability(ship.type);
      if (Math.random() < baseProbability && ship.groupId) {
        departingGroups.add(ship.groupId);
      }
    });

    // Filter ships that stay
    const shipsThatStay = agedShips.filter(ship => {
      if (this.pinnedShips[ship.id]) return true; // Always keep pinned ships

      let departureProbability = this.getBaseDepartureProbability(ship.type);

      // Increase departure chance if in departing convoy
      if (ship.groupId && departingGroups.has(ship.groupId)) {
        departureProbability *= 3;
      }

      return Math.random() > departureProbability;
    }).map(ship => this.toggleStatusRandomly(ship));

    // Calculate arrival rate based on region
    const params = this.calculateShipCount();
    const lambda = params.lambda;

    // Generate Poisson-distributed arrivals
    const newArrivals: Ship[] = [];
    let k = 0;
    let p = 1;
    const L = Math.exp(-lambda);

    do {
      k++;
      p *= Math.random();
    } while (p > L);

    // Generate new ships
    for (let i = 0; i < k - 1; i++) {
      newArrivals.push(this.createShip([...shipsThatStay, ...newArrivals]));
    }

    this.ships = [...shipsThatStay, ...newArrivals];
    this.notifyListeners();
  }

  // Start the update loop
  private startUpdateLoop() {
    setInterval(() => {
      this.updateShipList();
    }, 5000); // Update every 5 seconds
  }

  // Broadcast ship data to other stations
  private broadcastShipData() {
    if (this.socket) {
      this.socket.emit('ship_data_update', {
        room: this.room,
        ships: this.ships,
        pinnedShips: this.pinnedShips,
        doublePinnedShipId: this.doublePinnedShipId,
        currentRegion: this.currentRegion,
        source: 'ship_store',
        timestamp: Date.now()
      });
    }
  }
}

// Create singleton instance
export const shipStore = new ShipStore();