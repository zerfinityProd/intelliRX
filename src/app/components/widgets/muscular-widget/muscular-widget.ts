import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-muscular-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './muscular-widget.html',
  styleUrls: ['./muscular-widget.css']
})
export class MuscularWidgetComponent implements OnInit {
  @Input() initialSelected: string[] = [];
  selectedMuscleIds: string[] = [];
  @Output() selectionChange = new EventEmitter<string[]>();

  @ViewChild('widgetContainer') widgetContainer!: ElementRef;

  currentView: 'anterior' | 'posterior' = 'anterior';
  
  tooltipVisible: boolean = false;
  tooltipText: string = '';
  tooltipX: number = 0;
  tooltipY: number = 0;

  readonly muscleNames: Record<string, string> = {
    // ── Head & Neck ──
    'muscle_temporalis_left': 'Left Temporalis',
    'muscle_temporalis_right': 'Right Temporalis',
    'muscle_masseter_left': 'Left Masseter',
    'muscle_masseter_right': 'Right Masseter',
    'muscle_sternocleidomastoid_left': 'Left Sternocleidomastoid',
    'muscle_sternocleidomastoid_right': 'Right Sternocleidomastoid',
    'muscle_trapezius_left': 'Left Trapezius (Upper)',
    'muscle_trapezius_right': 'Right Trapezius (Upper)',

    // ── Torso (Anterior) ──
    'muscle_pectoralis_major_left': 'Left Pectoralis Major',
    'muscle_pectoralis_major_right': 'Right Pectoralis Major',
    'muscle_rectus_abdominis_left': 'Left Rectus Abdominis',
    'muscle_rectus_abdominis_right': 'Right Rectus Abdominis',
    'muscle_external_oblique_left': 'Left External Oblique',
    'muscle_external_oblique_right': 'Right External Oblique',
    'muscle_serratus_anterior_left': 'Left Serratus Anterior',
    'muscle_serratus_anterior_right': 'Right Serratus Anterior',

    // ── Upper Limbs ──
    'muscle_deltoid_left': 'Left Deltoid (Anterior)',
    'muscle_deltoid_right': 'Right Deltoid (Anterior)',
    'muscle_biceps_brachii_left': 'Left Biceps Brachii',
    'muscle_biceps_brachii_right': 'Right Biceps Brachii',
    'muscle_brachialis_left': 'Left Brachialis',
    'muscle_brachialis_right': 'Right Brachialis',
    'muscle_pronator_teres_left': 'Left Pronator Teres',
    'muscle_pronator_teres_right': 'Right Pronator Teres',
    'muscle_brachioradialis_left': 'Left Brachioradialis',
    'muscle_brachioradialis_right': 'Right Brachioradialis',
    'muscle_flexor_carpi_radialis_left': 'Left Flexor Carpi Radialis',
    'muscle_flexor_carpi_radialis_right': 'Right Flexor Carpi Radialis',
    'muscle_flexor_carpi_ulnaris_left': 'Left Flexor Carpi Ulnaris',
    'muscle_flexor_carpi_ulnaris_right': 'Right Flexor Carpi Ulnaris',

    // ── Lower Limbs (Anterior) ──
    'muscle_iliopsoas_left': 'Left Iliopsoas',
    'muscle_iliopsoas_right': 'Right Iliopsoas',
    'muscle_tensor_fasciae_latae_left': 'Left Tensor Fasciae Latae',
    'muscle_tensor_fasciae_latae_right': 'Right Tensor Fasciae Latae',
    'muscle_sartorius_left': 'Left Sartorius',
    'muscle_sartorius_right': 'Right Sartorius',
    'muscle_rectus_femoris_left': 'Left Rectus Femoris',
    'muscle_rectus_femoris_right': 'Right Rectus Femoris',
    'muscle_vastus_lateralis_left': 'Left Vastus Lateralis',
    'muscle_vastus_lateralis_right': 'Right Vastus Lateralis',
    'muscle_vastus_medialis_left': 'Left Vastus Medialis',
    'muscle_vastus_medialis_right': 'Right Vastus Medialis',
    'muscle_adductor_longus_left': 'Left Adductor Longus',
    'muscle_adductor_longus_right': 'Right Adductor Longus',
    'muscle_gracilis_left': 'Left Gracilis',
    'muscle_gracilis_right': 'Right Gracilis',
    'muscle_tibialis_anterior_left': 'Left Tibialis Anterior',
    'muscle_tibialis_anterior_right': 'Right Tibialis Anterior',
    'muscle_gastrocnemius_left': 'Left Gastrocnemius (Calf)',
    'muscle_gastrocnemius_right': 'Right Gastrocnemius (Calf)',
    'muscle_soleus_left': 'Left Soleus',
    'muscle_soleus_right': 'Right Soleus',
    'muscle_extensor_digitorum_left': 'Left Extensor Digitorum Longus',
    'muscle_extensor_digitorum_right': 'Right Extensor Digitorum Longus',

    // ── Posterior View Specific ──
    'muscle_occipitalis_left': 'Left Occipitalis',
    'muscle_occipitalis_right': 'Right Occipitalis',
    'muscle_splenius_capitis_left': 'Left Splenius Capitis',
    'muscle_splenius_capitis_right': 'Right Splenius Capitis',
    'muscle_trapezius_post_left': 'Left Trapezius (Posterior)',
    'muscle_trapezius_post_right': 'Right Trapezius (Posterior)',
    'muscle_latissimus_dorsi_left': 'Left Latissimus Dorsi',
    'muscle_latissimus_dorsi_right': 'Right Latissimus Dorsi',
    'muscle_infraspinatus_left': 'Left Infraspinatus',
    'muscle_infraspinatus_right': 'Right Infraspinatus',
    'muscle_teres_major_left': 'Left Teres Major',
    'muscle_teres_major_right': 'Right Teres Major',
    'muscle_erector_spinae_left': 'Left Erector Spinae',
    'muscle_erector_spinae_right': 'Right Erector Spinae',
    'muscle_gluteus_medius_left': 'Left Gluteus Medius',
    'muscle_gluteus_medius_right': 'Right Gluteus Medius',
    'muscle_gluteus_maximus_left': 'Left Gluteus Maximus',
    'muscle_gluteus_maximus_right': 'Right Gluteus Maximus',
    'muscle_biceps_femoris_left': 'Left Biceps Femoris (Hamstring)',
    'muscle_biceps_femoris_right': 'Right Biceps Femoris (Hamstring)',
    'muscle_semitendinosus_left': 'Left Semitendinosus (Hamstring)',
    'muscle_semitendinosus_right': 'Right Semitendinosus (Hamstring)',
    'muscle_semimembranosus_left': 'Left Semimembranosus (Hamstring)',
    'muscle_semimembranosus_right': 'Right Semimembranosus (Hamstring)',
    'muscle_adductor_magnus_left': 'Left Adductor Magnus',
    'muscle_adductor_magnus_right': 'Right Adductor Magnus',
    'muscle_triceps_brachii_left': 'Left Triceps Brachii',
    'muscle_triceps_brachii_right': 'Right Triceps Brachii',
    'muscle_deltoid_post_left': 'Left Deltoid (Posterior)',
    'muscle_deltoid_post_right': 'Right Deltoid (Posterior)',
  };

  ngOnInit() {
    if (this.initialSelected && this.initialSelected.length > 0) {
      this.selectedMuscleIds = [...this.initialSelected];
    }
  }

  setView(view: 'anterior' | 'posterior') {
    this.currentView = view;
    this.hideTooltip();
  }

  showTooltip(event: MouseEvent, muscleId: string) {
    this.tooltipText = this.muscleNames[muscleId] || muscleId;
    this.tooltipVisible = true;
    this.updateTooltipPos(event);
  }

  updateTooltipPos(event: MouseEvent) {
    if (!this.tooltipVisible || !this.widgetContainer) return;
    const containerRect = this.widgetContainer.nativeElement.getBoundingClientRect();
    this.tooltipX = event.clientX - containerRect.left + 15;
    this.tooltipY = event.clientY - containerRect.top + 15;
  }

  hideTooltip() {
    this.tooltipVisible = false;
  }

  toggleMuscle(muscleId: string) {
    const index = this.selectedMuscleIds.indexOf(muscleId);
    if (index === -1) {
      this.selectedMuscleIds.push(muscleId);
    } else {
      this.selectedMuscleIds.splice(index, 1);
    }
    this.selectedMuscleIds = [...this.selectedMuscleIds];
    this.selectionChange.emit(this.selectedMuscleIds);
  }

  isSelected(muscleId: string): boolean {
    return this.selectedMuscleIds.includes(muscleId);
  }

  clearSelection() {
    this.selectedMuscleIds = [];
    this.selectionChange.emit(this.selectedMuscleIds);
  }
}
