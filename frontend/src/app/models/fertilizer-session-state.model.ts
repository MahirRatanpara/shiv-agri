/**
 * Fertilizer Session State Machine - Implements State Pattern
 * Manages fertilizer session lifecycle transitions (3-state workflow)
 */

export type FertilizerSessionStatus = 'started' | 'generate-reports' | 'completed';

export interface FertilizerStateConfig {
  label: string;
  icon: string;
  color: string;
  description: string;
  allowedActions: {
    downloadPDFs: boolean;
    editData: boolean;
  };
  canTransitionTo: FertilizerSessionStatus[];
}

export class FertilizerSessionStateManager {
  private static readonly STATE_CONFIGS: Record<FertilizerSessionStatus, FertilizerStateConfig> = {
    started: {
      label: 'Data Entry',
      icon: 'fa-edit',
      color: '#2196F3',
      description: 'Enter fertilizer testing data and recommendations',
      allowedActions: {
        downloadPDFs: false,
        editData: true
      },
      canTransitionTo: ['generate-reports']
    },
    'generate-reports': {
      label: 'Generate Reports',
      icon: 'fa-file-pdf',
      color: '#4CAF50',
      description: 'Data locked - Generate and download PDF reports',
      allowedActions: {
        downloadPDFs: true,
        editData: false
      },
      canTransitionTo: ['started', 'completed']
    },
    completed: {
      label: 'Completed',
      icon: 'fa-flag-checkered',
      color: '#9C27B0',
      description: 'All reports distributed - Session archived',
      allowedActions: {
        downloadPDFs: true,
        editData: false
      },
      canTransitionTo: ['generate-reports']
    }
  };

  constructor(private currentStatus: FertilizerSessionStatus = 'started') {}

  /**
   * Get current state configuration
   */
  getCurrentState(): FertilizerStateConfig {
    return FertilizerSessionStateManager.STATE_CONFIGS[this.currentStatus];
  }

  /**
   * Get state configuration for any status
   */
  getStateConfig(status: FertilizerSessionStatus): FertilizerStateConfig {
    return FertilizerSessionStateManager.STATE_CONFIGS[status];
  }

  /**
   * Check if an action is allowed in current state
   */
  canPerformAction(action: keyof FertilizerStateConfig['allowedActions']): boolean {
    return this.getCurrentState().allowedActions[action];
  }

  /**
   * Get next state in the workflow
   */
  getNextState(): FertilizerSessionStatus | null {
    const transitions = this.getCurrentState().canTransitionTo;
    // Find the next state in natural progression
    const progression: FertilizerSessionStatus[] = ['started', 'generate-reports', 'completed'];
    const currentIndex = progression.indexOf(this.currentStatus);

    for (let i = currentIndex + 1; i < progression.length; i++) {
      if (transitions.includes(progression[i])) {
        return progression[i];
      }
    }
    return null;
  }

  /**
   * Get previous state in the workflow
   */
  getPreviousState(): FertilizerSessionStatus | null {
    const transitions = this.getCurrentState().canTransitionTo;
    // Find the previous state in natural progression
    const progression: FertilizerSessionStatus[] = ['started', 'generate-reports', 'completed'];
    const currentIndex = progression.indexOf(this.currentStatus);

    for (let i = currentIndex - 1; i >= 0; i--) {
      if (transitions.includes(progression[i])) {
        return progression[i];
      }
    }
    return null;
  }

  /**
   * Check if can transition to a specific state
   */
  canTransitionTo(targetStatus: FertilizerSessionStatus): boolean {
    return this.getCurrentState().canTransitionTo.includes(targetStatus);
  }

  /**
   * Transition to new state
   */
  transitionTo(newStatus: FertilizerSessionStatus): boolean {
    if (!this.canTransitionTo(newStatus)) {
      return false;
    }
    this.currentStatus = newStatus;
    return true;
  }

  /**
   * Get all states for progress indicator
   */
  static getAllStates(): { status: FertilizerSessionStatus; config: FertilizerStateConfig }[] {
    return (['started', 'generate-reports', 'completed'] as FertilizerSessionStatus[]).map(status => ({
      status,
      config: FertilizerSessionStateManager.STATE_CONFIGS[status]
    }));
  }

  /**
   * Get state index for progress calculation
   */
  getStateProgress(): number {
    const states: FertilizerSessionStatus[] = ['started', 'generate-reports', 'completed'];
    return (states.indexOf(this.currentStatus) / (states.length - 1)) * 100;
  }
}
