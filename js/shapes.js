// Shape library: filled outlines in a 100 x 100 box (SVG path data). Each one becomes an editable fabric.Path.

const star = (points, outer, inner) => {
    let d = "";
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? inner : outer, a = Math.PI * i / points - Math.PI / 2;
        d += `${i ? "L" : "M"}${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)} `;
    }
    return d + "Z";
};
const polygon = (sides, rot = -Math.PI / 2) => {
    let d = "";
    for (let i = 0; i < sides; i++) {
        const a = rot + 2 * Math.PI * i / sides;
        d += `${i ? "L" : "M"}${(50 + 50 * Math.cos(a)).toFixed(2)} ${(50 + 50 * Math.sin(a)).toFixed(2)} `;
    }
    return d + "Z";
};
const gear = () => {
    let d = "";
    const teeth = 10;
    for (let i = 0; i < teeth; i++) {
        const a0 = 2 * Math.PI * i / teeth, step = 2 * Math.PI / teeth;
        const pts = [[a0, 38], [a0 + step * 0.15, 50], [a0 + step * 0.45, 50], [a0 + step * 0.6, 38]];
        for (const [a, r] of pts) d += `${d ? "L" : "M"}${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)} `;
    }
    // the hole, drawn the other way round so it stays empty
    return d + "Z M50 36 A14 14 0 1 0 50 64 A14 14 0 1 0 50 36 Z";
};
const sun = () => {
    let d = "M50 30 A20 20 0 1 1 50 70 A20 20 0 1 1 50 30 Z ";
    for (let i = 0; i < 8; i++) {
        const a = Math.PI * i / 4, w = 0.16;
        const p = (r, da) => `${(50 + r * Math.cos(a + da)).toFixed(2)} ${(50 + r * Math.sin(a + da)).toFixed(2)}`;
        d += `M${p(26, -w)} L${p(48, 0)} L${p(26, w)} Z `;
    }
    return d;
};

export const SHAPES = {
    rect: { name: "Rectangle", d: "M0 0 H100 V100 H0 Z" },
    rounded: { name: "Rounded Rectangle", d: "M15 0 H85 Q100 0 100 15 V85 Q100 100 85 100 H15 Q0 100 0 85 V15 Q0 0 15 0 Z" },
    circle: { name: "Circle", d: "M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z" },
    triangle: { name: "Triangle", d: "M50 0 L100 100 L0 100 Z" },
    star: { name: "Star", d: star(5, 50, 20) },
    starburst: { name: "Starburst", d: star(12, 50, 34) },
    arrow: { name: "Arrow", d: "M0 35 H60 V10 L100 50 L60 90 V65 H0 Z" },
    chevron: { name: "Chevron", d: "M0 0 H45 L100 50 L45 100 H0 L55 50 Z" },
    diamond: { name: "Diamond", d: "M50 0 L100 50 L50 100 L0 50 Z" },
    hexagon: { name: "Hexagon", d: polygon(6, 0) },
    octagon: { name: "Octagon", d: polygon(8, Math.PI / 8) },
    heart: { name: "Heart", d: "M50 95 L12 58 C-8 38 4 6 30 6 C40 6 47 12 50 20 C53 12 60 6 70 6 C96 6 108 38 88 58 Z" },
    cross: { name: "Cross", d: "M35 0 H65 V35 H100 V65 H65 V100 H35 V65 H0 V35 H35 Z" },
    moon: { name: "Moon", d: "M62 2 A48 48 0 1 0 98 70 A38 38 0 1 1 62 2 Z" },
    sun: { name: "Sun", d: sun() },
    cloud: { name: "Cloud", d: "M25 85 A22 22 0 0 1 22 41 A28 28 0 0 1 75 33 A26 26 0 0 1 78 85 Z" },
    shield: { name: "Shield", d: "M50 0 L95 15 V45 C95 75 72 92 50 100 C28 92 5 75 5 45 V15 Z" },
    lightning: { name: "Lightning", d: "M60 0 L10 58 H45 L38 100 L90 38 H55 Z" },
    gear: { name: "Gear", d: gear() },
    flame: { name: "Flame", d: "M50 100 C20 100 5 80 8 58 C11 40 25 30 28 12 C40 22 44 34 42 46 C52 38 56 24 54 0 C80 18 95 45 92 66 C89 88 74 100 50 100 Z" },
    check: { name: "Checkmark", d: "M0 55 L15 40 L38 62 L85 12 L100 27 L38 90 Z" },
    plus: { name: "Plus", d: "M40 0 H60 V40 H100 V60 H60 V100 H40 V60 H0 V40 H40 Z" },
    stripe: { name: "Stripe", d: "M0 40 H100 V60 H0 Z" },
    semicircle: { name: "Semi-Circle", d: "M0 75 A50 50 0 0 1 100 75 Z" },
    trapezoid: { name: "Trapezoid", d: "M22 15 H78 L100 85 H0 Z" },
    parallelogram: { name: "Parallelogram", d: "M28 15 H100 L72 85 H0 Z" },
    ring: { name: "Ring", d: "M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z M50 22 A28 28 0 1 0 50 78 A28 28 0 1 0 50 22 Z" },
    slash: { name: "Racing Slash", d: "M30 0 H100 L70 100 H0 Z" },
};
