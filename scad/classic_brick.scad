// @id classic_brick
// @name Classic Brick
// @description Classic interlocking brick with top studs and bottom cylindrical female sockets.
// @param X|Width (studs)|1|10|1|4
// @param Y|Length (studs)|1|12|1|2
// @param Z|Height (plates)|1|9|1|3
// @param scale_percent|Global Scale (%)|90|110|1|100
//
// Reference proportions:
// - block pitch = 8.0mm
// - stud diameter = 4.8mm
// - stud height = 1.8mm
// - brick body height = 3.2mm * Z
// This version keeps the geometry in the Open Brick browser-compatible SCAD subset.

s = scale_percent / 100;

unit = 1.6 * s;
block = unit * 5;
height = unit * 2 * Z;
outert = 0.15 * s;

actualX = X * block - outert;
actualY = Y * block - outert;

topthickness = unit;
wallthickness = unit - outert / 2;
inner_h = height - topthickness;

hstud = unit + 0.2 * s;
dstud = unit * 3;

// Tube-like underside socket dimensions.
ODtube = 6.5137 * s;
tube_h = inner_h;

stud_x0 = (block - outert) / 2;
stud_y0 = (block - outert) / 2;
tube_x0 = block - outert / 2;
tube_y0 = block - outert / 2;

union() {
  // Hollow body shell with open bottom.
  translate([0, 0, height - topthickness]) {
    cube([actualX, actualY, topthickness], center=false);
  }
  cube([wallthickness, actualY, inner_h], center=false);
  translate([actualX - wallthickness, 0, 0]) {
    cube([wallthickness, actualY, inner_h], center=false);
  }
  translate([wallthickness, 0, 0]) {
    cube([actualX - wallthickness * 2, wallthickness, inner_h], center=false);
  }
  translate([wallthickness, actualY - wallthickness, 0]) {
    cube([actualX - wallthickness * 2, wallthickness, inner_h], center=false);
  }

  // Top male studs.
  for (i = [0:1:X - 1]) {
    for (j = [0:1:Y - 1]) {
      translate([stud_x0 + i * block, stud_y0 + j * block, height]) {
        cylinder(h=hstud, r=dstud / 2, $fn=28);
      }
    }
  }

  // Bottom female sockets as cylindrical tubes.
  for (i = [0:1:X - 2]) {
    for (j = [0:1:Y - 2]) {
      cx = tube_x0 + i * block;
      cy = tube_y0 + j * block;
      translate([cx, cy, 0]) {
        cylinder(h=tube_h, r=ODtube / 2, $fn=40);
      }
    }
  }
}
