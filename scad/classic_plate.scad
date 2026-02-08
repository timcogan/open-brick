// @id classic_plate
// @name Classic Plate
// @description Thin plate with top studs for low-profile stacking.
// @param X|Width (studs)|1|16|1|2
// @param Y|Length (studs)|1|16|1|4
// @param scale_percent|Global Scale (%)|95|105|1|100
//
// Reference proportions:
// - block pitch = 8.0mm
// - stud diameter = 4.8mm
// - stud height = 1.8mm
// - plate body height = 3.2mm
// This version keeps the geometry in the Open Brick browser-compatible SCAD subset.

s = scale_percent / 100;

unit = 1.6 * s;
block = unit * 5;
outert = 0.15 * s;

actualX = X * block - outert;
actualY = Y * block - outert;
plate_h = unit * 2;

hstud = unit + 0.2 * s;
dstud = unit * 3;

stud_x0 = (block - outert) / 2;
stud_y0 = (block - outert) / 2;

union() {
  // Solid plate body.
  cube([actualX, actualY, plate_h], center=false);

  // Top studs.
  for (i = [0:1:X - 1]) {
    for (j = [0:1:Y - 1]) {
      translate([stud_x0 + i * block, stud_y0 + j * block, plate_h]) {
        cylinder(h=hstud, r=dstud / 2, $fn=28);
      }
    }
  }
}
