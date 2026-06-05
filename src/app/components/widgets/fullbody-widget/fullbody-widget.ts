import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BoneView = 'full' | 'skull' | 'spine' | 'hand-left' | 'hand-right' | 'foot-left' | 'foot-right';

@Component({
  selector: 'app-fullbody-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fullbody-widget.html',
  styleUrls: ['./fullbody-widget.css']
})
export class FullbodyWidgetComponent implements OnInit {
  @Input() initialSelected: string[] = [];
  selectedBoneIds: string[] = [];
  @Output() selectionChange = new EventEmitter<string[]>();

  @ViewChild('widgetContainer') widgetContainer!: ElementRef;

  currentView: BoneView = 'full';
  
  tooltipVisible: boolean = false;
  tooltipText: string = '';
  tooltipX: number = 0;
  tooltipY: number = 0;

  ngOnInit() {
    if (this.initialSelected && this.initialSelected.length > 0) {
      this.selectedBoneIds = [...this.initialSelected];
    }
  }

  // Dictionary of bone IDs to human-readable names for the tooltip
  readonly boneNames: Record<string, string> = {
    // ── Skull & Neck (29) ──
    'skull_frontal': 'Frontal Bone',
    'skull_parietal_left': 'Left Parietal Bone',
    'skull_parietal_right': 'Right Parietal Bone',
    'skull_temporal_left': 'Left Temporal Bone',
    'skull_temporal_right': 'Right Temporal Bone',
    'skull_occipital': 'Occipital Bone',
    'skull_sphenoid': 'Sphenoid Bone',
    'skull_ethmoid': 'Ethmoid Bone',
    'skull_maxilla_left': 'Left Maxilla (Upper Jaw)',
    'skull_maxilla_right': 'Right Maxilla (Upper Jaw)',
    'skull_mandible': 'Mandible (Lower Jaw)',
    'skull_zygomatic_left': 'Left Zygomatic (Cheekbone)',
    'skull_zygomatic_right': 'Right Zygomatic (Cheekbone)',
    'skull_nasal_left': 'Left Nasal Bone',
    'skull_nasal_right': 'Right Nasal Bone',
    'skull_palatine_left': 'Left Palatine Bone',
    'skull_palatine_right': 'Right Palatine Bone',
    'skull_lacrimal_left': 'Left Lacrimal Bone',
    'skull_lacrimal_right': 'Right Lacrimal Bone',
    'skull_vomer': 'Vomer',
    'skull_concha_left': 'Left Inferior Nasal Concha',
    'skull_concha_right': 'Right Inferior Nasal Concha',
    'skull_malleus_left': 'Left Malleus (Ear Ossicle)',
    'skull_malleus_right': 'Right Malleus (Ear Ossicle)',
    'skull_incus_left': 'Left Incus (Ear Ossicle)',
    'skull_incus_right': 'Right Incus (Ear Ossicle)',
    'skull_stapes_left': 'Left Stapes (Ear Ossicle)',
    'skull_stapes_right': 'Right Stapes (Ear Ossicle)',
    'skull_hyoid': 'Hyoid Bone',

    // ── Spine (26) ──
    'spine_c1': 'C1 (Atlas)',
    'spine_c2': 'C2 (Axis)',
    'spine_c3': 'C3 Vertebra',
    'spine_c4': 'C4 Vertebra',
    'spine_c5': 'C5 Vertebra',
    'spine_c6': 'C6 Vertebra',
    'spine_c7': 'C7 Vertebra',
    'spine_t1': 'T1 Vertebra',
    'spine_t2': 'T2 Vertebra',
    'spine_t3': 'T3 Vertebra',
    'spine_t4': 'T4 Vertebra',
    'spine_t5': 'T5 Vertebra',
    'spine_t6': 'T6 Vertebra',
    'spine_t7': 'T7 Vertebra',
    'spine_t8': 'T8 Vertebra',
    'spine_t9': 'T9 Vertebra',
    'spine_t10': 'T10 Vertebra',
    'spine_t11': 'T11 Vertebra',
    'spine_t12': 'T12 Vertebra',
    'spine_l1': 'L1 Vertebra',
    'spine_l2': 'L2 Vertebra',
    'spine_l3': 'L3 Vertebra',
    'spine_l4': 'L4 Vertebra',
    'spine_l5': 'L5 Vertebra',
    'spine_sacrum': 'Sacrum',
    'spine_coccyx': 'Coccyx (Tailbone)',

    // ── Thorax (25) ──
    'sternum': 'Sternum (Breastbone)',
    'rib_left_1': 'Left Rib 1',
    'rib_left_2': 'Left Rib 2',
    'rib_left_3': 'Left Rib 3',
    'rib_left_4': 'Left Rib 4',
    'rib_left_5': 'Left Rib 5',
    'rib_left_6': 'Left Rib 6',
    'rib_left_7': 'Left Rib 7',
    'rib_left_8': 'Left Rib 8',
    'rib_left_9': 'Left Rib 9',
    'rib_left_10': 'Left Rib 10',
    'rib_left_11': 'Left Rib 11 (Floating)',
    'rib_left_12': 'Left Rib 12 (Floating)',
    'rib_right_1': 'Right Rib 1',
    'rib_right_2': 'Right Rib 2',
    'rib_right_3': 'Right Rib 3',
    'rib_right_4': 'Right Rib 4',
    'rib_right_5': 'Right Rib 5',
    'rib_right_6': 'Right Rib 6',
    'rib_right_7': 'Right Rib 7',
    'rib_right_8': 'Right Rib 8',
    'rib_right_9': 'Right Rib 9',
    'rib_right_10': 'Right Rib 10',
    'rib_right_11': 'Right Rib 11 (Floating)',
    'rib_right_12': 'Right Rib 12 (Floating)',

    // ── Upper Limbs (64) ──
    'clavicle_left': 'Left Clavicle (Collarbone)',
    'clavicle_right': 'Right Clavicle (Collarbone)',
    'scapula_left': 'Left Scapula (Shoulder Blade)',
    'scapula_right': 'Right Scapula (Shoulder Blade)',
    'humerus_left': 'Left Humerus',
    'humerus_right': 'Right Humerus',
    'radius_left': 'Left Radius',
    'radius_right': 'Right Radius',
    'ulna_left': 'Left Ulna',
    'ulna_right': 'Right Ulna',

    // Left Hand (27)
    'hand_left_scaphoid': 'Left Scaphoid',
    'hand_left_lunate': 'Left Lunate',
    'hand_left_triquetrum': 'Left Triquetrum',
    'hand_left_pisiform': 'Left Pisiform',
    'hand_left_trapezium': 'Left Trapezium',
    'hand_left_trapezoid': 'Left Trapezoid',
    'hand_left_capitate': 'Left Capitate',
    'hand_left_hamate': 'Left Hamate',
    'hand_left_mc1': 'Left Metacarpal 1',
    'hand_left_mc2': 'Left Metacarpal 2',
    'hand_left_mc3': 'Left Metacarpal 3',
    'hand_left_mc4': 'Left Metacarpal 4',
    'hand_left_mc5': 'Left Metacarpal 5',
    'hand_left_thumb_proximal': 'Left Thumb Proximal Phalanx',
    'hand_left_thumb_distal': 'Left Thumb Distal Phalanx',
    'hand_left_index_proximal': 'Left Index Proximal Phalanx',
    'hand_left_index_middle': 'Left Index Middle Phalanx',
    'hand_left_index_distal': 'Left Index Distal Phalanx',
    'hand_left_middle_proximal': 'Left Middle Finger Proximal Phalanx',
    'hand_left_middle_middle': 'Left Middle Finger Middle Phalanx',
    'hand_left_middle_distal': 'Left Middle Finger Distal Phalanx',
    'hand_left_ring_proximal': 'Left Ring Finger Proximal Phalanx',
    'hand_left_ring_middle': 'Left Ring Finger Middle Phalanx',
    'hand_left_ring_distal': 'Left Ring Finger Distal Phalanx',
    'hand_left_pinky_proximal': 'Left Pinky Proximal Phalanx',
    'hand_left_pinky_middle': 'Left Pinky Middle Phalanx',
    'hand_left_pinky_distal': 'Left Pinky Distal Phalanx',

    // Right Hand (27)
    'hand_right_scaphoid': 'Right Scaphoid',
    'hand_right_lunate': 'Right Lunate',
    'hand_right_triquetrum': 'Right Triquetrum',
    'hand_right_pisiform': 'Right Pisiform',
    'hand_right_trapezium': 'Right Trapezium',
    'hand_right_trapezoid': 'Right Trapezoid',
    'hand_right_capitate': 'Right Capitate',
    'hand_right_hamate': 'Right Hamate',
    'hand_right_mc1': 'Right Metacarpal 1',
    'hand_right_mc2': 'Right Metacarpal 2',
    'hand_right_mc3': 'Right Metacarpal 3',
    'hand_right_mc4': 'Right Metacarpal 4',
    'hand_right_mc5': 'Right Metacarpal 5',
    'hand_right_thumb_proximal': 'Right Thumb Proximal Phalanx',
    'hand_right_thumb_distal': 'Right Thumb Distal Phalanx',
    'hand_right_index_proximal': 'Right Index Proximal Phalanx',
    'hand_right_index_middle': 'Right Index Middle Phalanx',
    'hand_right_index_distal': 'Right Index Distal Phalanx',
    'hand_right_middle_proximal': 'Right Middle Finger Proximal Phalanx',
    'hand_right_middle_middle': 'Right Middle Finger Middle Phalanx',
    'hand_right_middle_distal': 'Right Middle Finger Distal Phalanx',
    'hand_right_ring_proximal': 'Right Ring Finger Proximal Phalanx',
    'hand_right_ring_middle': 'Right Ring Finger Middle Phalanx',
    'hand_right_ring_distal': 'Right Ring Finger Distal Phalanx',
    'hand_right_pinky_proximal': 'Right Pinky Proximal Phalanx',
    'hand_right_pinky_middle': 'Right Pinky Middle Phalanx',
    'hand_right_pinky_distal': 'Right Pinky Distal Phalanx',

    // ── Lower Limbs (62) ──
    'pelvis_left': 'Left Hip Bone (Ilium/Ischium/Pubis)',
    'pelvis_right': 'Right Hip Bone (Ilium/Ischium/Pubis)',
    'femur_left': 'Left Femur (Thigh Bone)',
    'femur_right': 'Right Femur (Thigh Bone)',
    'patella_left': 'Left Patella (Kneecap)',
    'patella_right': 'Right Patella (Kneecap)',
    'tibia_left': 'Left Tibia (Shinbone)',
    'tibia_right': 'Right Tibia (Shinbone)',
    'fibula_left': 'Left Fibula',
    'fibula_right': 'Right Fibula',

    // Left Foot (26)
    'foot_left_calcaneus': 'Left Calcaneus (Heel)',
    'foot_left_talus': 'Left Talus',
    'foot_left_navicular': 'Left Navicular',
    'foot_left_cuboid': 'Left Cuboid',
    'foot_left_cuneiform_medial': 'Left Medial Cuneiform',
    'foot_left_cuneiform_intermediate': 'Left Intermediate Cuneiform',
    'foot_left_cuneiform_lateral': 'Left Lateral Cuneiform',
    'foot_left_mt1': 'Left Metatarsal 1',
    'foot_left_mt2': 'Left Metatarsal 2',
    'foot_left_mt3': 'Left Metatarsal 3',
    'foot_left_mt4': 'Left Metatarsal 4',
    'foot_left_mt5': 'Left Metatarsal 5',
    'foot_left_gt_proximal': 'Left Great Toe Proximal Phalanx',
    'foot_left_gt_distal': 'Left Great Toe Distal Phalanx',
    'foot_left_t2_proximal': 'Left Toe 2 Proximal Phalanx',
    'foot_left_t2_middle': 'Left Toe 2 Middle Phalanx',
    'foot_left_t2_distal': 'Left Toe 2 Distal Phalanx',
    'foot_left_t3_proximal': 'Left Toe 3 Proximal Phalanx',
    'foot_left_t3_middle': 'Left Toe 3 Middle Phalanx',
    'foot_left_t3_distal': 'Left Toe 3 Distal Phalanx',
    'foot_left_t4_proximal': 'Left Toe 4 Proximal Phalanx',
    'foot_left_t4_middle': 'Left Toe 4 Middle Phalanx',
    'foot_left_t4_distal': 'Left Toe 4 Distal Phalanx',
    'foot_left_t5_proximal': 'Left Toe 5 Proximal Phalanx',
    'foot_left_t5_middle': 'Left Toe 5 Middle Phalanx',
    'foot_left_t5_distal': 'Left Toe 5 Distal Phalanx',

    // Right Foot (26)
    'foot_right_calcaneus': 'Right Calcaneus (Heel)',
    'foot_right_talus': 'Right Talus',
    'foot_right_navicular': 'Right Navicular',
    'foot_right_cuboid': 'Right Cuboid',
    'foot_right_cuneiform_medial': 'Right Medial Cuneiform',
    'foot_right_cuneiform_intermediate': 'Right Intermediate Cuneiform',
    'foot_right_cuneiform_lateral': 'Right Lateral Cuneiform',
    'foot_right_mt1': 'Right Metatarsal 1',
    'foot_right_mt2': 'Right Metatarsal 2',
    'foot_right_mt3': 'Right Metatarsal 3',
    'foot_right_mt4': 'Right Metatarsal 4',
    'foot_right_mt5': 'Right Metatarsal 5',
    'foot_right_gt_proximal': 'Right Great Toe Proximal Phalanx',
    'foot_right_gt_distal': 'Right Great Toe Distal Phalanx',
    'foot_right_t2_proximal': 'Right Toe 2 Proximal Phalanx',
    'foot_right_t2_middle': 'Right Toe 2 Middle Phalanx',
    'foot_right_t2_distal': 'Right Toe 2 Distal Phalanx',
    'foot_right_t3_proximal': 'Right Toe 3 Proximal Phalanx',
    'foot_right_t3_middle': 'Right Toe 3 Middle Phalanx',
    'foot_right_t3_distal': 'Right Toe 3 Distal Phalanx',
    'foot_right_t4_proximal': 'Right Toe 4 Proximal Phalanx',
    'foot_right_t4_middle': 'Right Toe 4 Middle Phalanx',
    'foot_right_t4_distal': 'Right Toe 4 Distal Phalanx',
    'foot_right_t5_proximal': 'Right Toe 5 Proximal Phalanx',
    'foot_right_t5_middle': 'Right Toe 5 Middle Phalanx',
    'foot_right_t5_distal': 'Right Toe 5 Distal Phalanx',
  };


  setView(view: BoneView) {
    this.currentView = view;
    this.hideTooltip();
  }

  showTooltip(event: MouseEvent, boneId: string) {
    // If it's a hotspot to another view, show the action
    if (boneId === 'hotspot_skull') this.tooltipText = '🔍 Click to view Skull Details';
    else if (boneId === 'hotspot_spine') this.tooltipText = '🔍 Click to view Spine Details';
    else if (boneId === 'hotspot_hand_left') this.tooltipText = '🔍 Click to view Left Hand Details';
    else if (boneId === 'hotspot_hand_right') this.tooltipText = '🔍 Click to view Right Hand Details';
    else if (boneId === 'hotspot_foot_left') this.tooltipText = '🔍 Click to view Left Foot Details';
    else if (boneId === 'hotspot_foot_right') this.tooltipText = '🔍 Click to view Right Foot Details';
    else {
      // Normal bone
      this.tooltipText = this.boneNames[boneId] || boneId;
    }

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

  toggleBone(boneId: string) {
    // Check if it's a hotspot
    if (boneId.startsWith('hotspot_')) {
      if (boneId === 'hotspot_skull') this.setView('skull');
      else if (boneId === 'hotspot_spine') this.setView('spine');
      else if (boneId === 'hotspot_hand_left') this.setView('hand-left');
      else if (boneId === 'hotspot_hand_right') this.setView('hand-right');
      else if (boneId === 'hotspot_foot_left') this.setView('foot-left');
      else if (boneId === 'hotspot_foot_right') this.setView('foot-right');
      return;
    }

    const index = this.selectedBoneIds.indexOf(boneId);
    if (index === -1) {
      this.selectedBoneIds.push(boneId);
    } else {
      this.selectedBoneIds.splice(index, 1);
    }
    // create a new array ref so Angular detects changes
    this.selectedBoneIds = [...this.selectedBoneIds];
    this.selectionChange.emit(this.selectedBoneIds);
  }

  isSelected(boneId: string): boolean {
    return this.selectedBoneIds.includes(boneId);
  }

  // Count selections for badges
  getSelectionCount(prefix: string): number {
    return this.selectedBoneIds.filter(id => id.startsWith(prefix)).length;
  }

  getViewName(): string {
    switch (this.currentView) {
      case 'skull': return 'Skull Details';
      case 'spine': return 'Spine Details';
      case 'hand-left': return 'Left Hand Details';
      case 'hand-right': return 'Right Hand Details';
      case 'foot-left': return 'Left Foot Details';
      case 'foot-right': return 'Right Foot Details';
      default: return '';
    }
  }

  clearSelection() {
    this.selectedBoneIds = [];
    this.selectionChange.emit(this.selectedBoneIds);
  }
}
