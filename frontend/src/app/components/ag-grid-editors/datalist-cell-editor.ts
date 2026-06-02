import { ICellEditorComp, ICellEditorParams } from 'ag-grid-community';

/**
 * Custom AG Grid cell editor that renders an `<input list>` bound to a
 * `<datalist>`. This gives users a searchable dropdown populated from a list
 * (e.g., fertilizer crop names) while still allowing them to type a value that
 * is not in the list — which covers spelling variants and brand new crops.
 *
 * Usage:
 *   {
 *     field: 'cropName',
 *     cellEditor: DatalistCellEditor,
 *     cellEditorParams: { values: () => ['Cotton', 'Wheat', ...] },
 *     cellEditorPopup: true
 *   }
 *
 * `values` may be:
 *  - an array of strings
 *  - a function returning an array (sync)
 *  - a function returning a Promise<string[]> (async)
 *  - a function that receives the AG Grid cellParams (so options can be row-aware)
 */
type ValuesProvider =
  | string[]
  | ((params?: ICellEditorParams) => string[] | Promise<string[]>);

export class DatalistCellEditor implements ICellEditorComp {
  private eGui!: HTMLDivElement;
  private eInput!: HTMLInputElement;
  private eDatalist!: HTMLDataListElement;
  private datalistId!: string;

  init(params: ICellEditorParams & { values?: ValuesProvider }): void {
    this.datalistId = `datalist-editor-${Math.random().toString(36).slice(2)}`;

    this.eGui = document.createElement('div');
    this.eGui.className = 'ag-input-wrapper datalist-cell-editor';
    this.eGui.style.display = 'flex';
    this.eGui.style.width = '100%';

    this.eInput = document.createElement('input');
    this.eInput.type = 'text';
    this.eInput.setAttribute('list', this.datalistId);
    this.eInput.autocomplete = 'off';
    this.eInput.className = 'ag-input-field-input ag-text-field-input';
    this.eInput.style.width = '100%';
    this.eInput.style.padding = '4px 8px';
    this.eInput.style.border = '1px solid #ccc';
    this.eInput.style.borderRadius = '4px';
    this.eInput.style.fontSize = '14px';
    this.eInput.value = params.value ?? '';

    this.eDatalist = document.createElement('datalist');
    this.eDatalist.id = this.datalistId;

    this.eGui.appendChild(this.eInput);
    this.eGui.appendChild(this.eDatalist);

    const populate = (values: string[]) => {
      // Clear any previous options before repopulating
      while (this.eDatalist.firstChild) {
        this.eDatalist.removeChild(this.eDatalist.firstChild);
      }
      for (const v of values) {
        if (!v) continue;
        const opt = document.createElement('option');
        opt.value = v;
        this.eDatalist.appendChild(opt);
      }
    };

    const raw = typeof params.values === 'function' ? params.values(params) : params.values;
    if (Array.isArray(raw)) {
      populate(raw);
    } else if (raw && typeof (raw as Promise<string[]>).then === 'function') {
      (raw as Promise<string[]>).then(populate).catch(() => populate([]));
    } else {
      populate([]);
    }
  }

  getGui(): HTMLElement {
    return this.eGui;
  }

  afterGuiAttached(): void {
    this.eInput.focus();
    this.eInput.select();
  }

  getValue(): string {
    return (this.eInput.value || '').trim();
  }

  destroy(): void {
    // No-op: DOM is removed by AG Grid.
  }

  isPopup(): boolean {
    return false;
  }
}
