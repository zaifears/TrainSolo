export type WorkflowState =
  | 'IDLE'
  | 'ATTACHING'
  | 'SESSION_VALIDATION'
  | 'JOURNEY_OPEN'
  | 'JOURNEY_VERIFIED'
  | 'SEAT_MAP_READY'
  | 'SEATS_PARSED'
  | 'CANDIDATE_SELECTED'
  | 'REVALIDATING'
  | 'CLICKING'
  | 'SELECTION_VERIFIED'
  | 'USER_ALERTED'
  | 'MANUAL_HANDOFF'
  | 'SESSION_EXPIRED'
  | 'NO_MATCHING_JOURNEY'
  | 'NO_ACCEPTABLE_SEATS'
  | 'STALE_SEAT_STATE'
  | 'SELECTION_MISMATCH'
  | 'DOM_UNRECOGNIZED'
  | 'SAFETY_STOP';

export class StateMachine {
  private currentState: WorkflowState = 'IDLE';
  private history: { state: WorkflowState; timestamp: Date }[] = [];

  constructor() {
    this.transition('IDLE');
  }

  public get state(): WorkflowState {
    return this.currentState;
  }

  public transition(next: WorkflowState): void {
    this.currentState = next;
    this.history.push({ state: next, timestamp: new Date() });
    console.log(`[Workflow State] ➔ ${next}`);
  }

  public isFailure(): boolean {
    const failureStates: WorkflowState[] = [
      'SESSION_EXPIRED',
      'NO_MATCHING_JOURNEY',
      'NO_ACCEPTABLE_SEATS',
      'STALE_SEAT_STATE',
      'SELECTION_MISMATCH',
      'DOM_UNRECOGNIZED',
      'SAFETY_STOP',
    ];
    return failureStates.includes(this.currentState);
  }
}
