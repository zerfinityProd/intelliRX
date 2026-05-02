import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Tooth {
    id: number;
    x: number;
    y: number;
    labelX: number;
    labelY: number;
    type: 'incisor' | 'canine' | 'premolar' | 'molar';
}

@Component({
    selector: 'app-dental-widget',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './dental-widget.html',
    styleUrls: ['./dental-widget.css']
})
export class DentalWidgetComponent {
    selectedTooth: number | null = null;

    teeth: Tooth[] = [
        // -------- UPPER OUTER --------
        { id: 18, x: 130, y: 340, labelX: -20, labelY: 0, type: 'molar' },
        { id: 17, x: 150, y: 280, labelX: -20, labelY: 0, type: 'molar' },
        { id: 16, x: 170, y: 220, labelX: -20, labelY: 0, type: 'molar' },
        { id: 15, x: 200, y: 165, labelX: -20, labelY: 0, type: 'premolar' },
        { id: 14, x: 235, y: 120, labelX: -20, labelY: 0, type: 'premolar' },
        { id: 13, x: 280, y: 80, labelX: -20, labelY: 0, type: 'canine' },
        { id: 12, x: 330, y: 50, labelX: -10, labelY: -15, type: 'incisor' },
        { id: 11, x: 390, y: 35, labelX: 0, labelY: -15, type: 'incisor' },

        { id: 21, x: 450, y: 35, labelX: 0, labelY: -15, type: 'incisor' },
        { id: 22, x: 510, y: 50, labelX: 10, labelY: -15, type: 'incisor' },
        { id: 23, x: 560, y: 80, labelX: 20, labelY: 0, type: 'canine' },
        { id: 24, x: 605, y: 120, labelX: 20, labelY: 0, type: 'premolar' },
        { id: 25, x: 640, y: 165, labelX: 20, labelY: 0, type: 'premolar' },
        { id: 26, x: 670, y: 220, labelX: 20, labelY: 0, type: 'molar' },
        { id: 27, x: 690, y: 280, labelX: 20, labelY: 0, type: 'molar' },
        { id: 28, x: 710, y: 340, labelX: 20, labelY: 0, type: 'molar' },

        // -------- UPPER INNER --------
        { id: 55, x: 300, y: 350, labelX: -25, labelY: 0, type: 'molar' },
        { id: 54, x: 335, y: 300, labelX: -25, labelY: 0, type: 'molar' },
        { id: 53, x: 375, y: 255, labelX: -20, labelY: 0, type: 'canine' },
        { id: 52, x: 420, y: 225, labelX: 0, labelY: -18, type: 'incisor' },
        { id: 51, x: 465, y: 215, labelX: 10, labelY: -18, type: 'incisor' },

        { id: 61, x: 510, y: 215, labelX: 10, labelY: -18, type: 'incisor' },
        { id: 62, x: 555, y: 225, labelX: 10, labelY: -18, type: 'incisor' },
        { id: 63, x: 600, y: 255, labelX: 15, labelY: 0, type: 'canine' },
        { id: 64, x: 640, y: 300, labelX: 20, labelY: 0, type: 'molar' },
        { id: 65, x: 675, y: 350, labelX: 20, labelY: 0, type: 'molar' },

        // -------- LOWER INNER --------
        { id: 85, x: 300, y: 470, labelX: -25, labelY: 25, type: 'molar' },
        { id: 84, x: 335, y: 520, labelX: -25, labelY: 25, type: 'molar' },
        { id: 83, x: 375, y: 565, labelX: -20, labelY: 25, type: 'canine' },
        { id: 82, x: 420, y: 595, labelX: 0, labelY: 28, type: 'incisor' },
        { id: 81, x: 465, y: 610, labelX: 0, labelY: 28, type: 'incisor' },

        { id: 71, x: 510, y: 610, labelX: 0, labelY: 28, type: 'incisor' },
        { id: 72, x: 555, y: 595, labelX: 0, labelY: 28, type: 'incisor' },
        { id: 73, x: 600, y: 565, labelX: 15, labelY: 25, type: 'canine' },
        { id: 74, x: 640, y: 520, labelX: 20, labelY: 25, type: 'molar' },
        { id: 75, x: 675, y: 470, labelX: 20, labelY: 25, type: 'molar' },

        // -------- LOWER OUTER --------
        { id: 48, x: 130, y: 470, labelX: -20, labelY: 20, type: 'molar' },
        { id: 47, x: 150, y: 530, labelX: -20, labelY: 20, type: 'molar' },
        { id: 46, x: 170, y: 590, labelX: -20, labelY: 20, type: 'molar' },
        { id: 45, x: 200, y: 645, labelX: -20, labelY: 20, type: 'premolar' },
        { id: 44, x: 235, y: 690, labelX: -20, labelY: 20, type: 'premolar' },
        { id: 43, x: 280, y: 730, labelX: -20, labelY: 20, type: 'canine' },
        { id: 42, x: 330, y: 760, labelX: -10, labelY: 25, type: 'incisor' },
        { id: 41, x: 390, y: 775, labelX: 0, labelY: 25, type: 'incisor' },

        { id: 31, x: 450, y: 775, labelX: 0, labelY: 25, type: 'incisor' },
        { id: 32, x: 510, y: 760, labelX: 10, labelY: 25, type: 'incisor' },
        { id: 33, x: 560, y: 730, labelX: 20, labelY: 20, type: 'canine' },
        { id: 34, x: 605, y: 690, labelX: 20, labelY: 20, type: 'premolar' },
        { id: 35, x: 640, y: 645, labelX: 20, labelY: 20, type: 'premolar' },
        { id: 36, x: 670, y: 590, labelX: 20, labelY: 20, type: 'molar' },
        { id: 37, x: 690, y: 530, labelX: 20, labelY: 20, type: 'molar' },
        { id: 38, x: 710, y: 470, labelX: 20, labelY: 20, type: 'molar' }
    ];

    selectTooth(id: number) {
        this.selectedTooth = id;
    }

    getToothPath(type: string) {
        switch (type) {
            case 'incisor':
                return 'M-18 15 Q0 -18 18 15 Q0 25 -18 15 Z';

            case 'canine':
                return 'M-16 18 Q0 -20 16 18 Q0 12 -16 18 Z';

            case 'premolar':
                return 'M-20 -8 Q0 -25 20 -8 Q22 18 0 24 Q-22 18 -20 -8 Z';

            default:
                return 'M-24 -10 Q0 -28 24 -10 Q28 18 0 28 Q-28 18 -24 -10 Z';
        }
    }

    onMouseEnter(element: any) {
        element.childNodes.forEach((x: any) => {
            x.style.fill = 'red'
        });
    }

    onMouseLeave(element: any) {
        element.childNodes.forEach((x: any) => {
            x.style.fill = 'none';
        });
    }
}