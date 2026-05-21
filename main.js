#!/usr/bin/env node

const fs = require('fs');
const yargs = require('yargs');

const argv = yargs
    .option('solution', {
        alias: 's',
        description: 'render the solution instead of a blank grid',
        type: 'boolean',
        default: false,
    })
    .help()
    .alias('help', 'h')
    .argv;


// monkey-patch some things that puz.js and puz_functions.js expect
global.window = global;
global.jspdf = require('jspdf');
global.alert = function(...args) {
  console.error(...args);
  process.exit(1);
};

const puz = require("./js/puz");
const funcs = require("./js/puz_functions");
const jsc = require("./js/jscrossword_combined");

// requiring these loads them into jspdf
require("./js/NunitoSans-Regular-bold");
require("./js/NunitoSans-Regular-normal");
require("./js/RobotoCondensed-bold");
require("./js/RobotoCondensed-normal");
//require("./js/OpenSansCondensed-bold");
//require("./js/OpenSansCondensed-normal");

function convert(filename, solution) {
  var contents = fs.readFileSync(filename).toString('binary');
  var xw_constructor = new jsc.JSCrossword();
  var puzdata = xw_constructor.fromData(contents);
  var outname = filename.replace(/[.](puz|ipuz|jpz|rgz)$/, '.pdf');
  if (outname === filename)
    outname += '.pdf';
  if (solution) {
    outname = outname.replace('.pdf', '-solution.pdf');
  }
  var options = {
    outfile: outname,
    output: 'download',
    // customizable:
    my_font: '',
    header_align: 'left',
    header2_align: 'right',
    subheader_align: 'left',
    y_align: 'alphabetic',
    grid_color: '0',
    header_pt: 20,
    header2_pt: 16,
    clue_entry_pt: 14,
    subheader_pt: 14,
    margin: 36,
    side_margin: 36,
    bottom_margin: 36,
    header_width: 6.7,
    grid_padding: 20,
    // header_indent: document.getElementById('hlPadding').value*1,
    // subheader_indent: document.getElementById('slPadding').value*1,
    // subheader_mt: document.getElementById('hsPadding').value*1,
    // line_width: document.getElementById('lineWidth').value*1,
    // border_width: document.getElementById('borderWidth').value*1,
    // column_padding: document.getElementById('columnPadding').value*1,
    // clue_spacing: document.getElementById('interSpacing').value-1,
    heading_style: 'bold',
    number_style: 'bold',
    shade: false,
    solution: solution,
    // header_font: document.getElementById('headerFont').value,
    // grid_font: document.getElementById('gridFont').value,
    // clue_font: document.getElementById('clueFont').value,
    right_header: true,
    subheader: false,
    copyright: true,
    // copyright_text: document.getElementById('copyright').value,
    // columns: document.getElementById('columns').value,
    grid_placement: 'top'
    // logoX: document.getElementById('logoX').value*1,
    // logoY: document.getElementById('logoY').value*1,
    // logoS: document.getElementById('logoS').value/100,
  };

  funcs.puzdata_to_pdf(puzdata, options);
}

if (argv._.length != 1) {
    throw 'Need exactly one positional arg (path to file to convert)';
}
convert(argv._[0], argv.solution);
