// @id mechanical_axle
// @name Mechanical Axle
// @description Cross-shaped mechanical axle compatible with Technic-style connectors.
// @param L|Length (L)|1|16|1|4
// @param scale_percent|Global Scale (%)|90|110|1|100
//
// Reference proportions:
// - block pitch = 8.0mm
// - axle across flats ~= 4.8mm
// - cross arm thickness ~= 1.8mm
// This version keeps the geometry in the Open Brick browser-compatible SCAD subset.

s = scale_percent / 100;

unit = 1.6 * s;
block = unit * 5;

length = L * block;
axle_outer = unit * 3;
axle_arm = 1.8 * s;

center_x = axle_outer / 2;
center_y = axle_outer / 2;
center_z = length / 2;

union() {
  // Cross axle shaft from two overlapping rectangular bars.
  translate([center_x, center_y, center_z]) {
    cube([axle_outer, axle_arm, length], center=true);
  }
  translate([center_x, center_y, center_z]) {
    cube([axle_arm, axle_outer, length], center=true);
  }
}
