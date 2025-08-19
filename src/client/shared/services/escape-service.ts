export class EscapeService {
  private static instance: EscapeService;

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }

    const onEscape = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') {
        return;
      }

      ev.stopPropagation();
      ev.preventDefault();

      (window.__ESCAPE_STACK__ || []).pop()?.eventCallback();
    };

    window.__ESCAPE_STACK__ = window.__ESCAPE_STACK__ || [];
    window.addEventListener('keydown', onEscape);
  }

  public static getInstance(): EscapeService {
    if (!EscapeService.instance) {
      EscapeService.instance = new EscapeService();
    }
    return EscapeService.instance;
  }

  public add(id: string, callback: () => void, order: number = 0): void {
    const event = { eventId: id, eventCallback: callback };
    const stack = window.__ESCAPE_STACK__;

    if (order === 1 && stack.length >= 1) {
      stack.splice(stack.length - 1, 0, event);
    } else {
      stack.push(event);
    }
  }

  public remove(id: string): void {
    window.__ESCAPE_STACK__ = window.__ESCAPE_STACK__.filter((item) => item.eventId !== id);
  }
}
