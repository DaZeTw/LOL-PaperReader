#!/bin/sh
set -e

# For development mode, use the dev wrapper script
if [ "$NODE_ENV" = "development" ] && [ "$1" = "npm" ] && [ "$2" = "run" ] && [ "$3" = "dev" ]; then
  exec /usr/local/bin/dev-wrapper.sh
fi

# For other commands, execute normally
exec "$@"

