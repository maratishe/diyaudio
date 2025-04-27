FROM node:18-bullseye

# Install SQLite and build essentials with additional dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    libsqlite3-dev \
    build-essential \
    python3 \
    pkg-config \
    git \
    cmake \
    libgomp1 \
    gfortran \
    libblas-dev \
    liblapack-dev \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files and install dependencies first (better for caching)
#COPY package.json ./
#RUN npm install

# Fix the possible duplicate extension issue in sqlite-vss paths
#RUN mkdir -p /app/node_modules && \
#    find /app/node_modules -name "*.so.so" -exec bash -c 'mv "$0" "${0%.so.so}.so"' \; || true

# Create directories to store data
#RUN mkdir -p /app/src

# Copy application code
#COPY . .

# Expose port
EXPOSE 8003

# node manager.js
CMD []