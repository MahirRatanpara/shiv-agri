import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BudgetCategory } from '../../models/project.model';

const DEFAULT_CATEGORIES = [
  'Materials', 'Labor', 'Equipment', 'Consultancy', 'Testing', 'Transportation', 'Miscellaneous'
];

@Component({
  selector: 'app-budget-sliders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './budget-sliders.html',
  styleUrl: './budget-sliders.css'
})
export class BudgetSlidersComponent {
  @Input() totalBudget = 0;
  @Input() categories: BudgetCategory[] = [];
  @Output() categoriesChange = new EventEmitter<BudgetCategory[]>();

  get totalPercentage(): number {
    return this.categories.reduce((sum, c) => sum + (c.percentage || 0), 0);
  }

  get isValid(): boolean {
    return Math.abs(this.totalPercentage - 100) < 0.01;
  }

  get remaining(): number {
    return Math.round((100 - this.totalPercentage) * 100) / 100;
  }

  ngOnInit(): void {
    if (this.categories.length === 0) {
      this.initDefaults();
    }
  }

  ngOnChanges(): void {
    this.recalcAmounts();
  }

  initDefaults(): void {
    const evenSplit = Math.floor(100 / DEFAULT_CATEGORIES.length);
    const remainder = 100 - (evenSplit * DEFAULT_CATEGORIES.length);

    this.categories = DEFAULT_CATEGORIES.map((cat, i) => ({
      category: cat,
      percentage: evenSplit + (i === 0 ? remainder : 0),
      amount: 0
    }));
    this.recalcAmounts();
    this.emitChange();
  }

  distributeEvenly(): void {
    const count = this.categories.length;
    if (count === 0) return;
    const evenSplit = Math.floor(100 / count);
    const remainder = 100 - (evenSplit * count);

    this.categories.forEach((cat, i) => {
      cat.percentage = evenSplit + (i === 0 ? remainder : 0);
    });
    this.recalcAmounts();
    this.emitChange();
  }

  onSliderChange(index: number): void {
    // Clamp to 0-100
    this.categories[index].percentage = Math.max(0, Math.min(100, this.categories[index].percentage));
    this.recalcAmounts();
    this.emitChange();
  }

  addCategory(name: string): void {
    if (!name.trim()) return;
    if (this.categories.some(c => c.category.toLowerCase() === name.trim().toLowerCase())) return;
    this.categories.push({ category: name.trim(), percentage: 0, amount: 0 });
    this.emitChange();
  }

  removeCategory(index: number): void {
    this.categories.splice(index, 1);
    this.recalcAmounts();
    this.emitChange();
  }

  private recalcAmounts(): void {
    this.categories.forEach(cat => {
      cat.amount = Math.round((cat.percentage / 100) * this.totalBudget * 100) / 100;
    });
  }

  private emitChange(): void {
    this.categoriesChange.emit([...this.categories]);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  }

  get Math() { return Math; }

  newCategoryName = '';

  onAddCategory(): void {
    this.addCategory(this.newCategoryName);
    this.newCategoryName = '';
  }
}
