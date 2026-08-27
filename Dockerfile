# Use the official Nginx unprivileged Alpine image
# - Lightweight (Alpine based, ~10MB)
# - Secure (runs as a non-root user by default)
FROM nginxinc/nginx-unprivileged:alpine

# Copy only the necessary static files into the Nginx server directory
COPY index.html /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY fonts/ /usr/share/nginx/html/fonts/

# Expose port 8080 (unprivileged port used by this image)
EXPOSE 8080
