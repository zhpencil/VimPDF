interface MathEditorController {
  undo: () => boolean
  redo: () => boolean
}

let active: MathEditorController | null = null

export function registerMathEditor(controller: MathEditorController): () => void {
  active = controller
  return () => {
    if (active === controller) active = null
  }
}

export function undoMathEditor(): boolean {
  return active ? active.undo() : false
}

export function redoMathEditor(): boolean {
  return active ? active.redo() : false
}
