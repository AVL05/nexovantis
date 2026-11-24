# Plantilla de revisión (no constituye evidencia)

TASK-ID / GATE:
Fase (PRE / POST / RETEST / AUDIT):
Fecha:

## Agente, modelo y esfuerzo
Agente:
Modelo solicitado / efectivo / fuente de verificación:
Esfuerzo solicitado / efectivo / fuente de verificación:
Grado de evidencia: verificado por CLI / autoinformado / no verificable (el esfuerzo efectivo es "no verificable" mientras no exista comprobación por CLI).

## Git
Rama:
SHA base:
SHA o diff final:
Estado Git antes (`git status --porcelain -uall`, staged, SHA):
Estado Git después:

## Archivos modificados
Estado (M / A / D / ??) | ruta | justificación
Resumen de diff (`git diff --stat`):

## Entorno
SO y versiones (Claude Code, Node, pnpm, Git):

## Criterios
Criterios aplicables y su origen:

## Comandos y resultados
Comando | exit code | resultado real | evidencia

## Hallazgos
ID | gravedad (Critical / High / Medium / Low / Informational) | archivo/línea | reproducción | esperado | obtenido | criterio | estado
La escala y su efecto están en docs/TESTING_GUIDELINES.md.

## Validación estática, efectiva parcial y efectiva pendiente
Validación estática (lectura, grep, JSON, simulación):
Validación efectiva parcial en subagente (casos inocuos):
Validación efectiva pendiente (humano o reinicio) y responsable:

## Limitaciones
Checks no ejecutados y motivo:

## Veredicto
Seleccionar uno solo de los tres, únicamente tras verificación: PASS / FAIL / BLOCKED.

PASS solo si todos los criterios aplicables se ejecutaron y se superaron, sin hallazgos Critical/High ni incumplimientos de criterios aprobados. FAIL ante cualquier incumplimiento de un criterio aprobado o ante cualquier hallazgo Critical/High, con independencia de la etiqueta de gravedad. BLOCKED si falta evidencia o no se puede ejecutar o verificar un criterio o requisito aplicable; BLOCKED nunca se convierte en PASS sin evidencia. Los hallazgos Medium/Low/Informational fuera de criterios se listan y requieren aceptación humana explícita y registrada; es un registro, no una variante de veredicto. Los únicos veredictos son PASS, FAIL y BLOCKED.

Iteraciones y correcciones:
Aceptación humana (pendiente hasta que exista):
