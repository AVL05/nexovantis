# Estado del proyecto

Fecha: 2026-11-24. Rama `chore/project-foundation`, SHA base `86611a8`. Estado de la fundación multiagente (F0 y F1), consolidado en TASK-005.

- F0: completada. Herramientas locales verificadas por el usuario (Node 24.22.2, pnpm 12.16.1, Git 2.56, gh 2.103.3 autenticado, Codex 0.166.0). Claude Code 2.1.327 verificado con `claude --version` por Orchestrator (TASK-001); 2.1.331 tras el reinicio de TASK-002-RUNTIME. Repositorio privado creado. Entorno de trabajo elegido por el humano: Claude Code Desktop.
- F1: cerrada por decisión humana explícita DH-G1 (2026-11-24, [TASK-003](reviews/claude/TASK-003.md)). G1 no tiene PASS de Testing ni aprobación de Codex: AUDIT-001 conserva su veredicto FAIL.
  - TASK-001 (validación del entorno multiagente): resultado preliminar BLOCKED. Informe: [TASK-001](reviews/claude/TASK-001.md).
  - TASK-002 (endurecimiento de la fundación y gobernanza multiagente). Veredictos históricos conservados sin editar y rectificados en [TASK-002-ADDENDUM](reviews/claude/TASK-002-ADDENDUM.md):
    - RETEST ([TASK-002-RETEST](reviews/claude/TASK-002-RETEST.md)): emitido PASS; rectificado a **FAIL** (63 PASS, 3 FAIL, 0 BLOCKED, 1 N.A.). B16 FAIL (Medium) con desviación aceptada limitada al orden de edición; G05 y E01 FAIL (Medium) por omisiones documentales de los informes de Develop; el humano los acepta como desviaciones documentadas (TASK-005), conservando su veredicto y sin reconstruir evidencias inexistentes.
    - RUNTIME ([TASK-002-RUNTIME](reviews/claude/TASK-002-RUNTIME.md)): emitido BLOCKED; rectificado a **FAIL** por RV-01 (High confirmado). RV-02 queda provisional.
    - Criterios: [TASK-002-PRE](reviews/claude/TASK-002-PRE.md); POST: [TASK-002-POST](reviews/claude/TASK-002-POST.md); informe: [TASK-002](reviews/claude/TASK-002.md).
    - Excepción histórica de TASK-002: el humano autorizó, únicamente para TASK-002, que Develop modificara los archivos de configuración de agentes y directrices estrictamente necesarios. No modifica de forma permanente las restricciones de Develop.
  - Auditoría de Codex: [AUDIT-001](reviews/codex/AUDIT-001.md), veredicto FAIL, estática y local (copia saneada en TASK-005: rutas locales absolutas de los enlaces sustituidas por rutas relativas, contenido sin cambios). Disposición tras DH-G1:
    - AUD-01 (High, conectores claude.ai disponibles en Desktop) y AUD-03 (Medium provisional, `ask` sin verificar): abiertos; comprobaciones canceladas por el humano y riesgo residual aceptado para desarrollo local con datos ficticios y sin secretos reales (docs/SECURITY.md). Los agentes no usan servicios externos sin permiso humano.
    - AUD-02: rectificado en TASK-002-ADDENDUM.
    - AUD-04: abierto con mitigación documental (filtro de ignorados por nombre y comparación recomendada de hashes en docs/AGENT_WORKFLOW.md).
    - AUD-05: procedimiento adaptado a Desktop en docs/AGENT_WORKFLOW.md y docs/ROADMAP.md.
  - TASK-003 (cierre documental de F1): criterios en [TASK-003-PRE](reviews/claude/TASK-003-PRE.md), reducidos por DH-G1; registro en [TASK-003](reviews/claude/TASK-003.md); POST **PASS** limitado al cierre documental reducido ([TASK-003-POST](reviews/claude/TASK-003-POST.md)), con hallazgos Low/Informational para aceptación humana. Los criterios C01-* y C03-* constan como cancelados por decisión humana.
  - Esfuerzo efectivo de los agentes: no verificable (configurado `high`; override global `effortLevel` conocido, RV-03, sin modificar).
  - D1 pendiente: Docker, WSL y Supabase CLI no verificados (preflight en F3).
  - Normalización de saltos de línea de los archivos existentes: pendiente de autorización humana (`.gitattributes` ya define LF).
  - Decisiones pendientes: DH-01..DH-08 y DH-13 (reglas de negocio); DH-09 (cobertura, F2); véase docs/BUSINESS_RULES.md y docs/ROADMAP.md.
  - Decisiones aprobadas por el humano (comunicadas en la sesión de TASK-002-RUNTIME): normalización LF mediante `.gitattributes`; el archivado conserva el historial e impide nuevas asignaciones; las órdenes completadas son estado terminal; se permite cancelar antes de completar, respetando las reglas de negocio; MCP externos restringidos por defecto; no instalar Docker ni dependencias todavía (para F2, el humano autorizó expresamente instalar las dependencias del scaffold: "Comprueba las versiones y compatibilidades antes de instalar las dependencias"; Docker sigue sin autorizar); cobertura centrada en riesgos y reglas críticas; skills especializadas en fases posteriores. Orchestrator no las ha cruzado con los identificadores DH.
- F2 (Next.js Foundation): autorizada por el humano en DH-G1; el scaffold y su revisión se registran en el commit siguiente.
- F3–F8: pendientes.

No hay todavía aplicación, base de datos ni despliegue.
