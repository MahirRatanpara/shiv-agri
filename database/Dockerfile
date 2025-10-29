FROM mongo:7

# Metadata
LABEL maintainer="Shiv Agri Development Team"
LABEL description="MongoDB container for Shiv Agri local development"
LABEL version="1.0"

# Set environment variables
ENV MONGO_INITDB_DATABASE=shiv-agri

# Copy initialization script
COPY init-mongo.js /docker-entrypoint-initdb.d/

# Expose MongoDB port
EXPOSE 27017

# MongoDB data directory
VOLUME ["/data/db", "/data/configdb"]

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
  CMD echo 'db.runCommand("ping").ok' | mongosh localhost:27017/shiv-agri --quiet || exit 1

# Start MongoDB
CMD ["mongod", "--bind_ip_all"]
