import { Build } from './build';

document.querySelector('#build')?.append(new Build(import.meta.env.VITE_COMMIT).label());
