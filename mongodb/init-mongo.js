// MongoDB Initialization Script
// This script runs automatically when MongoDB container starts for the first time
// It creates the application user with the specified credentials

// Get database name from environment variable
const dbName = process.env.MONGO_INITDB_DATABASE || 'shiv-agri';
const appUser = process.env.MONGO_APP_USER || 'shivagri-app';
const appPassword = process.env.MONGO_APP_PASSWORD || 'defaultpass';

print('========================================');
print('MongoDB Initialization Script');
print('========================================');
print('Database: ' + dbName);
print('Creating application user: ' + appUser);
print('========================================');

// Switch to the application database
db = db.getSiblingDB(dbName);

// Create the application user
try {
    db.createUser({
        user: appUser,
        pwd: appPassword,
        roles: [
            {
                role: 'readWrite',
                db: dbName
            }
        ]
    });
    print('✓ User "' + appUser + '" created successfully in database "' + dbName + '"');
    print('  Role: readWrite');
} catch (error) {
    if (error.code === 51003) {
        print('⚠ User "' + appUser + '" already exists, skipping creation');
    } else {
        print('✗ Error creating user: ' + error.message);
        throw error;
    }
}

print('========================================');
print('Initialization Complete!');
print('========================================');
