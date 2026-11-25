# TASK-008A — RETEST

Veredicto: PASS.

- F1 (Low) corregido: Button.tsx y NavList.tsx usan `transition-[background-color,border-color,color]`; ya no se anima outline-color. Medido sin espera al enfocar el botón por teclado: `rgb(11,95,217) 2px` desde el primer instante. Captura: `<scratchpad de la sesión>/screens/login-focus-btn-immediate.png` (temporal; ruta local saneada por Orchestrator).
- F2 (Informational) corregido: login-form.tsx sin contenedor `aria-live`; solo `Alert role="alert"` con `data-testid="form-error"`, sin anuncio duplicado. `useActionState(loginAction)`, `formAction`, hidden `next` y campos sin cambios; `src/features/auth/actions.ts`, proxy y lib sin diff.
- Comandos: test:unit 173 passed (exit 0), lint 0, typecheck 0, build 0, test:e2e 12 passed.
- Nota de proceso: una primera medición dio outline 0px por un servidor `next start` obsoleto durante la reconstrucción (CSS servido de 21 bytes); se reinició y se midió bien. No es un defecto del código.
- Limitaciones: sin cambios respecto a POST (dashboard sin inspección visual con sesión real; e2e:supabase solo CI).
