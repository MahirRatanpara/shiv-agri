import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectContact, ContactRole } from '../../models/project.model';

@Component({
  selector: 'app-contact-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contact-manager.html',
  styleUrl: './contact-manager.css'
})
export class ContactManagerComponent {
  @Input() contacts: ProjectContact[] = [];
  @Input() readonly = false;
  @Output() contactsChange = new EventEmitter<ProjectContact[]>();

  showForm = false;
  editingIndex = -1;

  roles: { value: ContactRole; label: string }[] = [
    { value: 'owner', label: 'Owner' },
    { value: 'manager', label: 'Manager' },
    { value: 'architect', label: 'Architect' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'worker', label: 'Worker' },
    { value: 'consultant', label: 'Consultant' },
    { value: 'vendor', label: 'Vendor' },
    { value: 'other', label: 'Other' }
  ];

  formData: ProjectContact = this.emptyContact();

  private emptyContact(): ProjectContact {
    return { fullName: '', designation: '', phone: '', email: '', role: 'other', isPrimary: false, isActive: true };
  }

  openAddForm(): void {
    this.formData = this.emptyContact();
    this.editingIndex = -1;
    this.showForm = true;
  }

  editContact(index: number): void {
    this.formData = { ...this.contacts[index] };
    this.editingIndex = index;
    this.showForm = true;
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingIndex = -1;
    this.formData = this.emptyContact();
  }

  saveContact(): void {
    if (!this.formData.fullName.trim()) return;

    // If setting as primary, unset others
    if (this.formData.isPrimary) {
      this.contacts.forEach(c => c.isPrimary = false);
    }

    if (this.editingIndex >= 0) {
      this.contacts[this.editingIndex] = { ...this.formData };
    } else {
      // First contact auto-primary
      if (this.contacts.length === 0) this.formData.isPrimary = true;
      this.contacts.push({ ...this.formData });
    }

    this.contactsChange.emit([...this.contacts]);
    this.cancelForm();
  }

  removeContact(index: number): void {
    const wasPrimary = this.contacts[index].isPrimary;
    this.contacts.splice(index, 1);
    // If removed was primary, make first one primary
    if (wasPrimary && this.contacts.length > 0) {
      this.contacts[0].isPrimary = true;
    }
    this.contactsChange.emit([...this.contacts]);
  }

  toggleActive(index: number): void {
    this.contacts[index].isActive = !this.contacts[index].isActive;
    this.contactsChange.emit([...this.contacts]);
  }

  setPrimary(index: number): void {
    this.contacts.forEach((c, i) => c.isPrimary = i === index);
    this.contactsChange.emit([...this.contacts]);
  }

  getInitial(name: string): string {
    return (name || '?')[0].toUpperCase();
  }

  getRoleLabel(role: ContactRole): string {
    return this.roles.find(r => r.value === role)?.label || role;
  }
}
