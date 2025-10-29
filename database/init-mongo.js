db = db.getSiblingDB('shiv-agri');

// Create collections
db.createCollection('users');
db.createCollection('products');
db.createCollection('projects');

// Users collection indexes
db.users.createIndex({ email: 1 }, { unique: true });

// Products collection indexes
db.products.createIndex({ name: 1 });

// Projects collection indexes (Landscaping Management)
db.projects.createIndex({ projectName: 1 });
db.projects.createIndex({ farmName: 1 });
db.projects.createIndex({ status: 1 });
db.projects.createIndex({ 'location.city': 1 });
db.projects.createIndex({ createdAt: -1 });
db.projects.createIndex({ status: 1, createdAt: -1 });
db.projects.createIndex({ 'location.city': 1, status: 1 });

// Text index for search functionality
db.projects.createIndex(
  { projectName: 'text', farmName: 'text', 'location.city': 'text' },
  { name: 'project_search_index' }
);

// Insert sample landscaping project data (optional - for testing)
db.projects.insertMany([
  {
    projectName: 'Green Valley Landscaping',
    farmName: 'Sunflower Farm',
    status: 'RUNNING',
    location: {
      address: '123 Farm Road, Green Valley',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380001',
      coordinates: {
        latitude: 23.0225,
        longitude: 72.5714
      }
    },
    landInfo: {
      size: 5000,
      unit: 'sqft',
      soilType: 'Loamy',
      irrigationType: 'Drip Irrigation',
      waterSource: 'Borewell'
    },
    contacts: [
      {
        name: 'Rajesh Patel',
        phone: '9876543210',
        email: 'rajesh@example.com',
        role: 'OWNER',
        isPrimary: true
      }
    ],
    description: 'Complete landscaping project with modern irrigation system',
    startDate: new Date('2025-01-01'),
    estimatedCost: 500000,
    files: [],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    projectName: 'Rose Garden Development',
    farmName: 'Lotus Farm',
    status: 'COMPLETED',
    location: {
      address: '456 Garden Street',
      city: 'Surat',
      state: 'Gujarat',
      pincode: '395001',
      coordinates: {
        latitude: 21.1702,
        longitude: 72.8311
      }
    },
    landInfo: {
      size: 2,
      unit: 'acres',
      soilType: 'Clay',
      irrigationType: 'Sprinkler',
      waterSource: 'Canal'
    },
    contacts: [
      {
        name: 'Priya Shah',
        phone: '9123456789',
        email: 'priya@example.com',
        role: 'OWNER',
        isPrimary: true
      },
      {
        name: 'Amit Kumar',
        phone: '9234567890',
        role: 'ARCHITECT',
        isPrimary: false
      }
    ],
    description: 'Rose garden with decorative elements',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-12-31'),
    estimatedCost: 750000,
    actualCost: 720000,
    files: [],
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date()
  },
  {
    projectName: 'Urban Terrace Garden',
    status: 'UPCOMING',
    location: {
      address: '789 City Plaza',
      city: 'Vadodara',
      state: 'Gujarat',
      pincode: '390001',
      coordinates: {
        latitude: 22.3072,
        longitude: 73.1812
      }
    },
    landInfo: {
      size: 1500,
      unit: 'sqft',
      soilType: 'Sandy',
      irrigationType: 'Manual',
      waterSource: 'Municipal'
    },
    contacts: [
      {
        name: 'Neha Desai',
        phone: '9345678901',
        email: 'neha@example.com',
        role: 'OWNER',
        isPrimary: true
      }
    ],
    description: 'Rooftop terrace garden design',
    startDate: new Date('2025-03-01'),
    estimatedCost: 300000,
    files: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print('Database initialized successfully with sample data');
print('Collections created: users, products, projects');
print('Sample projects inserted: 3');
