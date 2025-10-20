db = db.getSiblingDB('shiv-agri');

db.createCollection('users');
db.createCollection('products');

db.users.createIndex({ email: 1 }, { unique: true });
db.products.createIndex({ name: 1 });

print('Database initialized successfully');
