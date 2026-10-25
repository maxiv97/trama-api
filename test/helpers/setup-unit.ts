import { Logger } from '@nestjs/common';

// Los servicios loguean errores esperados (correo caído, avisos que fallan): en las pruebas
// unitarias se silencian para que la salida muestre solo el resultado.
Logger.overrideLogger(false);
