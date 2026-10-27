// Fresh-clone convenience: create .env from .env.example if it does not exist yet.
import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('[ensure-env] .env not found, created it from .env.example');
}
