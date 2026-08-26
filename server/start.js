/**
 * Punctul de pornire al serverului.
 *
 * Exista ca fisier separat intentionat. Varianta anterioara pornea serverul din
 * index.js sub o garda `import.meta.url === pathToFileURL(process.argv[1]).href`,
 * ca sa nu porneasca si cand modulul e importat de teste. Garda esua tacut —
 * procesul iesea cu cod 0 fara sa asculte pe niciun port si fara niciun mesaj.
 *
 * Un fisier de entry dedicat nu are cum sa se strice: index.js exporta doar,
 * start.js porneste doar.
 */
import { startServer } from './index.js';

startServer();
