/**
 * Session State Machine - Implements State Pattern
 * Manages session lifecycle transitions and available actions
 */

export type SessionStatus = 'started' | 'details' | 'ready' | 'completed';

export interface StateConfig {
  label: string;
  icon: string;
  color: string;
  description: string;
  allowedActions: {
    addRow: boolean;
    uploadExcel: boolean;
    deleteSelected: boolean;
    downloadPDFs: boolean;
    editData: boolean;
  };
  canTransitionTo: SessionStatus[];
}

export class SessionStateManager {
  private static readonly STATE_CONFIGS: Record<SessionStatus, StateConfig> = {
    started: {
      label: 'Testing',
      icon: 'fa-flask',
      color: '#2196F3',
      description: 'Lab testing in progress - Enter test results and readings',
      allowedActions: {
        addRow: true,
        uploadExcel: false,
        deleteSelected: true,
        downloadPDFs: false,
        editData: true
      },
      canTransitionTo: ['details']
    },
    details: {
      label: 'Customer Info',
      icon: 'fa-user-edit',
      color: '#FF9800',
      description: 'Add customer/farmer details via Excel or manual entry',
      allowedActions: {
        addRow: true,
        uploadExcel: true,
        deleteSelected: true,
        downloadPDFs: false,
        editData: true
      },
      canTransitionTo: ['started', 'ready']
    },
    ready: {
      label: 'Generate Reports',
      icon: 'fa-file-pdf',
      color: '#4CAF50',
      description: 'Data locked - Generate and download PDF reports',
      allowedActions: {
        addRow: false,
        uploadExcel: false,
        deleteSelected: false,
        downloadPDFs: true,
        editData: false
      },
      canTransitionTo: ['details', 'completed']
    },
    completed: {
      label: 'Completed',
      icon: 'fa-flag-checkered',
      color: '#9C27B0',
      description: 'All reports distributed - Session archived',
      allowedActions: {
        addRow: false,
        uploadExcel: false,
        deleteSelected: false,
        downloadPDFs: true,
        editData: false
      },
      canTransitionTo: ['ready']
    }
  };

  constructor(private currentStatus: SessionStatus = 'started') {}

  /**
   * Get current state configuration
   */
  getCurrentState(): StateConfig {
    return SessionStateManager.STATE_CONFIGS[this.currentStatus];
  }

  /**
   * Get state configuration for any status
   */
  getStateConfig(status: SessionStatus): StateConfig {
    return SessionStateManager.STATE_CONFIGS[status];
  }

  /**
   * Check if an action is allowed in current state
   */
  canPerformAction(action: keyof StateConfig['allowedActions']): boolean {
    return this.getCurrentState().allowedActions[action];
  }

  /**
   * Get next state in the workflow
   */
  getNextState(): SessionStatus | null {
    const transitions = this.getCurrentState().canTransitionTo;
    // Find the next state in natural progression
    const progression: SessionStatus[] = ['started', 'details', 'ready', 'completed'];
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
  getPreviousState(): SessionStatus | null {
    const transitions = this.getCurrentState().canTransitionTo;
    // Find the previous state in natural progression
    const progression: SessionStatus[] = ['started', 'details', 'ready', 'completed'];
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
  canTransitionTo(targetStatus: SessionStatus): boolean {
    return this.getCurrentState().canTransitionTo.includes(targetStatus);
  }

  /**
   * Transition to new state
   */
  transitionTo(newStatus: SessionStatus): boolean {
    if (!this.canTransitionTo(newStatus)) {
      return false;
    }
    this.currentStatus = newStatus;
    return true;
  }

  /**
   * Get all states for progress indicator
   */
  static getAllStates(): { status: SessionStatus; config: StateConfig }[] {
    return (['started', 'details', 'ready', 'completed'] as SessionStatus[]).map(status => ({
      status,
      config: SessionStateManager.STATE_CONFIGS[status]
    }));
  }

  /**
   * Get state index for progress calculation
   */
  getStateProgress(): number {
    const states: SessionStatus[] = ['started', 'details', 'ready', 'completed'];
    return (states.indexOf(this.currentStatus) / (states.length - 1)) * 100;
  }
}
