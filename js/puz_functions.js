// Parts of this code from Crossword Nexus
// (c) 2016 Alex Boisvert
// licensed under MIT license
// https://opensource.org/licenses/MIT

// Remainder of this code (c) Nam Jin Yoon
// licensed under MIT license
// https://opensource.org/licenses/MIT
const fs = require('fs');
const path = require('path');

window.jsPDF = window.jspdf.jsPDF;

/* function to strip HTML tags */
/* via https://stackoverflow.com/a/5002618 */
function strip_html(s) {
    // TODO commenting this out for the node version
    //var div = document.createElement("div");
    //div.innerHTML = s;
    //var text = div.textContent || div.innerText || "";
    return s;
}

/** Helper functions for splitting text with tags **/
function traverseTree(htmlDoc, agg=[]) {
    if (htmlDoc.nodeName == '#text') {
        // if we have a text element we can add it
        var thisTag = htmlDoc.parentNode.tagName;
        var is_bold = (thisTag == 'B');
        var is_italic = (thisTag == 'I');
        var textContent = htmlDoc.textContent;
        textContent.replace(/\s+/g, ' ');
        htmlDoc.textContent.split('').forEach(char => {
            agg.push({'char': char, 'is_bold': is_bold, 'is_italic': is_italic});
        });
    }

    for (var i = 0; i < htmlDoc.childNodes.length; i++) {
        agg = traverseTree(htmlDoc.childNodes[i], agg=agg);
    }

    return agg;
}

/* Print a line of text that may be bolded or italicized */
const printCharacters = (doc, textObject, startY, startX, fontSize, font) => {
    if (!textObject.length) {
        return;
    }

    if (typeof(textObject) == 'string') {
        //var myText = ASCIIFolder.foldReplacing(textObject, '*')
        var myText = textObject;
        doc.text(startX, startY, myText);
    } else {
        textObject.map(row => {
            if (row.is_bold) {
                doc.setFont(font, 'bold');
            }
            else if (row.is_italic) {
                doc.setFont(font, 'italic');
            }
            else {
                doc.setFont(font, 'normal');
            }

            // Some characters don't render properly in PDFs
            // TODO: replace them using the mapping above
            var mychar = row.char;
            //mychar = ASCIIFolder.foldReplacing(mychar, '*');
            doc.text(mychar, startX, startY);
            startX = startX + doc.getStringUnitWidth(row.char) * fontSize;
            doc.setFont(font, 'normal');
        });
    }
};

/* helper function for bold and italic clues */
function split_text_to_size_bi(clue, col_width, doc, font, has_header=false) {
    // get the clue with HTML stripped out
    // TODO
    //var el = document.createElement( 'html' );
    //el.innerHTML = clue;
    var clean_clue = clue;

    // split the clue
    var lines1 = doc.splitTextToSize(clean_clue, col_width);

    // if there's no <B> or <I> in the clue just return lines1
    if (clue.toUpperCase().indexOf('<B') == -1 && clue.toUpperCase().indexOf('<I') == -1) {
        return lines1;
    }

    // Check if there's a "header"
    // if so, track the header, and separate out the clue
    var header_line = null;
    if (has_header) {
        var clue_split = clue.split('\n');
        header_line = clue_split[0];
        clue = clue_split.slice(1).join('\n');
        el.innerHTML = clue;
        clean_clue = el.innerText;
    }

    // parse the clue into a tree
    var parser = new DOMParser();
    var htmlDoc = parser.parseFromString(clue, 'text/html');
    var split_clue = traverseTree(htmlDoc);

    // Make a new "lines1" with all bold splits
    doc.setFont(font, 'bold');
    lines1 = doc.splitTextToSize(clean_clue, col_width);
    doc.setFont(font, 'normal');

    // split this like we did the "lines1"
    var lines = [];
    var ctr = 0;
    // Characters to skip
    const SPLIT_CHARS = new Set([' ', '\t', '\n']);
    lines1.forEach(line => {
        var thisLine = [];
        var myLen = line.length;
        for (var i = 0; i < myLen; i++) {
            thisLine.push(split_clue[ctr++]);
        }
        if (split_clue[ctr]) {
            if (SPLIT_CHARS.has(split_clue[ctr].char)) {
                ctr = ctr + 1;
            }
        }
        lines.push(thisLine);
    });
    if (has_header) {
        lines = [header_line].concat(lines);
    }
    return lines;
}

/**
  * Draw a crossword grid (requires jsPDF)
  * doc is a jsPDF instance
  * xw is a JSCrossword instance
  **/
function draw_crossword_grid(doc, xw, options) {
    // options are as below
    var DEFAULT_OPTIONS = {
        grid_letters: true
    ,   grid_numbers: true
    ,   x0: 20
    ,   y0: 20
    ,   cell_size: 24
    ,   grid_color: 1 // accepts #rgb, defaults to black

    ,   shade: false // accepts #rgb, defaults to gray if `true`:
    ,   shade_outline: false // accepts #rgb, defaults to grid_color otherwise

    ,   circle_width: 0.7
    ,   line_width: 0.7
    ,   border_width: 0.7 // draws if greater than line_width
    ,   border_color: 1 // defaults to grid_color

    ,   bar_width: 2
    ,   number_size: null
    ,   number_color: 1 // accepts #rgb, defaults to black

        // Janky way to suport drawing a second color
    ,   second_color: null // accepts #rgb
        // accepts a dict of [x, y] that lists cells to be drawn in second_color. this overrides other settings.
    ,   second_color_cells: null
    };

    options = { ...DEFAULT_OPTIONS, ...options };

    var cell_size = options.cell_size;

    /** Function to draw a square **/
    function draw_square(doc, x1, y1, cell_size, number, letter, filled, cell, barsOnly=false) {
        if (!barsOnly) {
            var MIN_NUMBER_SIZE = 5.5;

            var filled_string = (filled ? 'F' : '');
            var number_offset = cell_size / 20;
            var number_size = options.number_size ||
                (cell_size / 3.5 < MIN_NUMBER_SIZE ? MIN_NUMBER_SIZE : cell_size / 3.5);

            // for "clue" cells we set the background and text color
            // todo(terry): what is a clue cell?
            doc.setTextColor(0, 0, 0);
            if (cell.clue) {
            cell['background-color'] = '#CCCCCC';
            }

            doc.setLineWidth(options.line_width);
            // puz files only export circles (background-shape); shades are set manually in my code
            if (cell['background-color'] || (cell['background-shape'] && options.shade)) {
                var input_color = '#D9D9D9';
                if (typeof(options.shade) === 'string') {
                    input_color = options.shade;
                }
                var color = cell['background-color'] || input_color;

                const cell_coords = `${cell.x},${cell.y}`;
                if (options.second_color && options.second_color_cells
                    && cell_coords in options.second_color_cells) {
                    color = options.second_color;
                }

                doc.setFillColor(color);

                // Draw one filled square (interior) and unfilled (with default or
                // provided color).
                doc.setDrawColor(options.grid_color.toString());
                doc.rect(x1, y1, cell_size, cell_size, 'F');

                var shade_outline_color = options.shade_outline || options.grid_color;
                doc.setDrawColor(shade_outline_color);
                doc.rect(x1, y1, cell_size, cell_size);
            } else {
                doc.setFillColor(options.grid_color.toString());
                doc.setDrawColor(options.grid_color.toString());

                // draw the bounding box for all squares -- even "clue" squares
                doc.rect(x1, y1, cell_size, cell_size);
                if (filled_string) {
                    doc.rect(x1, y1, cell_size, cell_size, filled_string);
                }
            }

            // numbers
            doc.setFontSize(number_size);
            doc.setTextColor(options.number_color);
            doc.text(x1 + number_offset, y1 + number_size, number);

            // top-right numbers
            var top_right_number = cell.top_right_number ? cell.top_right_number : '';
            doc.setFontSize(number_size);
            doc.text(x1 + cell_size - number_offset, y1 + number_size, top_right_number, null, null, 'right');

            // letters
            if (letter) {
                var letter_length = letter.length;
                var letter_size = cell_size / (1.5 + 0.5 * (letter_length - 1));
                var letter_pct_down = 4/5;
                doc.setFontSize(letter_size);
                doc.text(x1 + cell_size / 2, y1 + cell_size * letter_pct_down, letter, null, null, 'center');
            }

            // circles: shade may be provided, or empty circle will be drawn.
            if (cell['background-shape'] && !options.shade) {
                if (options.circle_shade) {
                    doc.setFillColor(options.circle_shade);
                    doc.circle(x1+cell_size / 2, y1+cell_size / 2, cell_size / 2, 'F');
                } else {
                    doc.setLineWidth(options.circle_width);
                    doc.circle(x1+cell_size / 2, y1+cell_size / 2, cell_size / 2);
                }
            }
        }

      // bars
      cell.bar = {
        top: cell['top-bar']
      , left: cell['left-bar']
      , right: cell['right-bar']
      , bottom: cell['bottom-bar']
      };

      if (cell.bar) {
          var bar = cell.bar;
          var bar_start = {
              top: [x1, y1],
              left: [x1, y1],
              right: [x1 + cell_size, y1 + cell_size],
              bottom: [x1 + cell_size, y1 + cell_size]
          };
          var bar_end = {
              top: [x1 + cell_size, y1],
              left: [x1, y1 + cell_size],
              right: [x1 + cell_size, y1],
              bottom: [x1, y1 + cell_size]
          };
          for (var key in bar) {
              if (bar.hasOwnProperty(key)) {
                  if (bar[key]) {
                      doc.setLineWidth(options.bar_width);
                      doc.line(bar_start[key][0], bar_start[key][1], bar_end[key][0], bar_end[key][1]);
                      doc.setLineWidth(options.line_width);
                  }
              }
          }
      }

      // Reset the text color, if necessary
      doc.setTextColor(0, 0, 0);
    }

    xw.cells.forEach(function(c) {
        // don't draw a square if we have a void
        if (c.is_void || (c.type === 'block' && c['background-color'] === '#FFFFFF')) {
          return;
        }

        var x_pos = options.x0 + c.x * cell_size;
        var y_pos = options.y0 + c.y * cell_size;

        // letter
        var letter = c.solution || '';
        if (!options.grid_letters) {
            letter = '';
        }
        letter = letter || c.letter || '';

        var filled = c.type == 'block';

        // number
        var number = c['number'] || '';
        if (!options.grid_numbers) {number = '';}

        // draw the square unless it's a void
        // or a block with a white background
        draw_square(doc, x_pos, y_pos, cell_size, number, letter, filled, c);
    });

    // Draw just the bars afterward
    // This is necessary because we may have overwritten bars earlier
    xw.cells.forEach(function(c) {
        var x_pos = options.x0 + c.x * cell_size;
        var y_pos = options.y0 + c.y * cell_size;
        draw_square(doc, x_pos, y_pos, cell_size, '', '', false, c, true);
    });

    // Draw border
    if (options.border_width > options.line_width) {
        // todo ... values are reconstructed from outer scope
        const grid_width = options.cell_size * xw.metadata.width;
        const grid_height = options.cell_size * xw.metadata.height;

        const border_color = options.border_color || options.grid_color || '#000000';
        doc.setDrawColor(border_color);
        doc.setLineWidth(options.border_width);
        doc.rect(options.x0 - (options.border_width / 2),
            options.y0 - (options.border_width / 2),
            grid_width + options.border_width,
            grid_height + options.border_width);
    }
}

/** Create a PDF (requires jsPDF) **/
function puzdata_to_pdf(xw, options) {
    var DEFAULT_OPTIONS = {
        outfile: 'puz.pdf'
    ,   pdf_orientation: 'portrait'
    ,   pdf_height: 11 // in
    ,   pdf_width: 8.5 // in
    ,   outfile: null
    ,   solution: false

    ,   top_margin: 20
    ,   side_margin: 20
    ,   bottom_margin: 140

    ,   columns: "auto"
    ,   num_columns: null
    ,   num_full_columns: null
    ,   column_padding: 10
    ,   clue_font: 'RobotoCondensed'
    ,   max_clue_pt: 14
    ,   clue_spacing: 0.3
    ,   y_align: 'top'

        // applies to all headers
    ,   header_font: 'RobotoCondensed'
    ,   under_title_spacing: 20

    ,   header_text: null
    ,   header_pt: 20
    ,   header_align: 'left'
    ,   header_indent: 0
    ,   header_width: 67

    ,   header2_text: null
    ,   header2_pt: 16
    ,   header2_align: 'right'
    ,   right_header: false

        // subheader is under header
    ,   subheader: false
    ,   subheader_text: null
    ,   subheader_pt: 14
    ,   subheader_align: 'left'
    ,   subheader_mt: 4
    ,   subheader_indent: 0

    ,   copyright: true
    ,   copyright_pt: 8
    ,   copyright_text: null

    ,   grid_font: 'NunitoSans-Regular'
    ,   grid_placement: 'top'
    ,   grid_padding: 12
    ,   grid_color: 1 // accepts #rgb
    ,   line_width: 0.4
    ,   border_width: 0.4
    ,   shade: true

    ,   logo: null
    ,   logoX: 36
    ,   logoY: 36
    ,   logoS: 1.0
    };

    for (var key in DEFAULT_OPTIONS) {
        if (!DEFAULT_OPTIONS.hasOwnProperty(key)) continue;
        if (!options.hasOwnProperty(key)) {
            options[key] = DEFAULT_OPTIONS[key];
        }
    }

    /* Choose columns */
    // Clue letter count
    var clue_length = xw.clues.map(x => x.clue).flat().map(x => x.text).join('').length;

    // If columns are not manually selected, choose number
    if (options.columns == "auto") {
        var xw_height = xw.metadata.height;
        var xw_width = xw.metadata.width;

        // Portrait = 5 columns with 3 full columns
        if (xw_height > 2 * xw_width) {
            options.num_columns = 5;
            options.num_full_columns = 3;
        }

        // handle puzzles with very few words
        else if (clue_length <= 1000) {
            options.num_columns = Math.max(Math.ceil(clue_length / 400), 2);
            options.num_full_columns = 0;
        }
        // extra-tall puzzles
        else if (xw_height >= 17) {
            options.num_columns = 6;
            options.num_full_columns = 2;
        }
        // extra-wide puzzles
        else if (xw_width > 17) {
            options.num_columns = 4;
            options.num_full_columns = 1;
        }
        // long clues
        else if (clue_length >= 1600) {
            options.num_columns = 5;
            options.num_full_columns = 2;
        }
        // default to 3.
        else {
            options.num_columns = 3;
            options.num_full_columns = 1;
        }
    } else {
        if (options.columns == "1") {
            options.num_columns = 1;
            options.num_full_columns = 1;
        } else if (options.columns == "2") {
            options.num_columns = 2;
            options.num_full_columns = 0;
        } else if (options.columns == "3") {
            options.num_columns = 3;
            options.num_full_columns = 1;
        } else if (options.columns == "4") {
            options.num_columns = 4;
            options.num_full_columns = 1;
        } else if (options.columns == "6") {
            options.num_columns = 6;
            options.num_full_columns = 2;
        } else if (options.columns == "new") {
            var numCols = Math.min(Math.ceil(clue_length / 800), 5);
            options.num_columns = numCols;
            options.num_full_columns = numCols;
        } else {
            options.num_columns = 5;
            options.num_full_columns = 2;
        }
    }

    // Margins
    var top_margin = options.top_margin;
    var side_margin = options.side_margin;
    var bottom_margin = options.bottom_margin;
    // starting value (we'll add header title height to this later)
    var header_height = options.under_title_spacing;

    /* Calculate header */
    var title_xpos = side_margin + options.header_indent;
    var title_ypos = top_margin;
    var xalign = options.header_align;
    var baseline = options.y_align;
    var title = options.header_text;

    var PTS_PER_IN = 72;
    var DOC_WIDTH = options.pdf_width * PTS_PER_IN;
    var DOC_HEIGHT = options.pdf_height * PTS_PER_IN;

    // This `doc` is discarded, it's just for querying `getTextWidth` and
    // computing rendered line length (vis-a-vis font etc).
    var docOptions = { orientation: options.pdf_orientation, unit: 'pt', format: [DOC_WIDTH, DOC_HEIGHT] }
    var doc = new jsPDF(docOptions);

    if (options.my_font.length > 0) {
        doc.addFileToVFS("MyFont.ttf", options.my_font);
        doc.addFont("MyFont.ttf", "myFont", "bold");
        doc.addFont("MyFont.ttf", "myFont", "italic");
        console.log(`Font {options.my_font} Added`);
    }

    doc.setFontSize(options.header_pt);
    doc.setFont(options.header_font, 'bold');

    if (options.header_align == 'center') {
        title_xpos = DOC_WIDTH / 2;
    }

    if (baseline == 'alphabetic') {
        title_ypos += options.header_pt;
    } else if (baseline == 'middle') {
        title_ypos += options.header_pt / 2;
    }

    if (!options.header_text) {
        title = xw.metadata.title;
    }

    if (!options.copyright) {
        options.copyright_pt = 0;
    }

    var title_width = doc.getTextWidth(title);
    var title_right_margin = doc.getTextWidth('  ');
    var max_width = DOC_WIDTH - 2*side_margin;

    if (options.right_header) {
        max_width = options.header_width * max_width;
    }

    // Title is an array
    title = doc.splitTextToSize(title, max_width);
    if (title) {
        // multiply by the _number of lines of the title_ there are
        header_height += 1.15 * title.length * options.header_pt;
    }

    // Right-header (header2)
    var author_xpos = DOC_WIDTH - side_margin;
    var author_ypos = top_margin;
    var author = options.header2_text;
    var author_align = options.header2_align;

    if (options.right_header) {
        max_width = DOC_WIDTH - (2*side_margin + doc.getTextWidth(title[0]) + title_right_margin);

        if (!options.header2_text) {
            author = xw.metadata.author.trim();
        }

        doc.setFontSize(options.header2_pt);
        author = doc.splitTextToSize(author, max_width);

        if (author.length * options.header2_pt > title.length * options.header_pt) {
            header_height += (author.length * options.header2_pt) - (title.length * options.header_pt);
        }

        if (baseline == 'alphabetic') {
            author_ypos = title_ypos;
        }

        if (baseline == 'middle') {
            author_ypos = top_margin + options.header_pt * title.length / 2;
        }

        if (author_align == 'left') {
            author_xpos = title_width + side_margin + title_right_margin;
        }
    }

    // Subheader
    var subheader_xpos = side_margin + options.subheader_indent;
    var subheader_ypos = title_ypos + 1.15*options.header_pt * (title.length-1) + options.subheader_pt + options.subheader_mt;
    var subheader_text = options.subheader_text;
    var subheader_align = options.subheader_align;

    if (options.subheader && subheader_text) {
        header_height += options.subheader_mt

        max_width = DOC_WIDTH - 2*side_margin;

        doc.setFontSize(options.subheader_pt);
        subheader_text = doc.splitTextToSize(subheader_text, max_width);

        if (subheader_align == 'left') {
            header_height += subheader_text.length * options.subheader_pt;
            if (baseline == 'top') {
                subheader_ypos = title_ypos + options.header_pt * title.length + options.subheader_mt;
            }
        } else if (subheader_align == 'center') {
            header_height += subheader_text.length * options.subheader_pt;
            subheader_xpos = DOC_WIDTH / 2;
            if (baseline == 'top') {
                subheader_ypos = title_ypos + options.header_pt * title.length + options.subheader_mt;
            }
        } else if (subheader_align == 'right') {
            subheader_xpos = DOC_WIDTH - side_margin;
            subheader_ypos = author_ypos + 1.15 * options.header2_pt * (author.length - 1) + options.subheader_pt + options.subheader_mt;

            if (baseline == 'top') {
                subheader_ypos = author_ypos + 1.15 * options.header2_pt * (author.length - 1) + options.header2_pt + options.subheader_mt;
                if ((author.length * options.header2_pt) < (title.length * options.header_pt)) {
                    header_height += (subheader_text.length * options.subheader_pt)
                        - ((title.length * options.header_pt) - (author.length * options.header2_pt));
                }
            } else {
                header_height += subheader_text.length * options.subheader_pt;
            }
        }
    }

    // create the clue strings and clue arrays
    var clue_arrays = [];
    var num_arrays = [];
    for (j = 0; j < xw.clues.length; j++) {
        var these_clues = [];
        var these_nums = [];
        for (i = 0; i < xw.clues[j]['clue'].length; i++) {
            var e = xw.clues[j]['clue'][i];
            var num = e.number;
            var clue = e.text;

            var this_clue_string = clue;

            if (i == 0) {
                these_clues.push(xw.clues[j].title + '\n' + this_clue_string);
            } else {
                these_clues.push(this_clue_string);
            }

            these_nums.push(num);
        }

        // add a space between the clue lists, assuming we're not at the end
        if (j < xw.clues.length - 1) {
            these_clues.push('');
            these_nums.push('');
        }

        clue_arrays.push(these_clues);
        num_arrays.push(these_nums);
    }

    // Computed column width: (page - margins - col padding) divided by columns
    var col_width = (DOC_WIDTH - (2 * side_margin) - (options.num_columns - 1) * options.column_padding) / options.num_columns;

    /* Compute grid width. */
    // The grid is under all but the first few columns
    var grid_width = DOC_WIDTH - (2 * side_margin) - options.num_full_columns * (col_width + options.column_padding);

    // Square grids need to get made smaller, in my case
    if (xw.metadata.width == xw.metadata.height) {
        grid_width = 190;
    }

    // Manually handle the 1-column case, since the second "column" is the grid.
    if (options.num_columns == 1) {
        console.log('manual spacing for 1-column layout');
        col_width = (DOC_WIDTH - (2 * side_margin) - grid_width - 3*options.column_padding) / 2;
    }

    // If only two columns, grid size is limited
    if (options.columns == "new" || options.num_columns == 2) {
        grid_width = DOC_WIDTH - 2 * side_margin;
    }

    if (options.grid_width) {
        grid_width = options.grid_width;
    }

    // We change the grid width and height if num_full_columns == 0
    // This is because we don't want it to take up too much space
    if (options.num_full_columns === 0) {
        // set the height to be (about) half of the available area
        grid_height = DOC_HEIGHT * 4/9;
        grid_width = (grid_height / xw_height) * xw_width;

        // however! if this is bigger than allowable, re-calibrate
        if (grid_width > (DOC_WIDTH - 2 * top_margin)) {
            grid_width = (DOC_WIDTH - 2 * top_margin);
            grid_height = (grid_width / xw_width) * xw_height;
        }
    }

    /* Calculate other grid values. */
    var grid_height = (grid_width / xw.metadata.width) * xw.metadata.height;
    // x and y position of grid
    var grid_xpos = DOC_WIDTH - side_margin - grid_width;

    if (options.grid_placement == "left") {
        grid_xpos = side_margin;
    }

    // If only two columns, grid size is limited
    if (options.num_columns == 2 || options.columns == "new") {
        grid_xpos = (DOC_WIDTH - grid_width) / 2;
    }

    // Smaller grids can be centered between the last two columns
    if (xw.metadata.width == xw.metadata.height || options.grid_width && options.columns > 1) {
        grid_xpos -= ((2*col_width + options.column_padding) - grid_width)/2;
    }

    var grid_ypos = DOC_HEIGHT - bottom_margin - grid_height - options.copyright_pt;

    /* Find an appropriate font size */
    var spacing_strictness = 1.2;
    const max_clue_num_length = xw.clues.map(x => x.clue).flat().map(x => x.number).map(x  =>  x.length).reduce((a, b)  =>  Math.max(a, b));
    const manual_spacing = options.num_full_columns == 0;

    // Starting values
    var clue_pt = options.max_clue_pt;
    var column_clue_padding = [];
    var line_padding = clue_pt * 0; // todo(terry): why * 0?
    var clue_padding = clue_pt * options.clue_spacing;

    var skip_column = false;
    var emergency_button = 0;

    while (!manual_spacing) {
        doc = new jsPDF(docOptions);
        doc.setFont(options.clue_font, "normal");
        doc.setFontSize(clue_pt);

        // num_margin = width of number columns
        var num_margin = doc.getTextWidth('9'.repeat(max_clue_num_length));

        var num_xpos = side_margin + num_margin;
        // line_margin = width of spacing between number and clue
        var line_margin = 1.5 * doc.getTextWidth(' ');
        // width of space that the clue can take up
        var col_clue_width = col_width - (num_margin + line_margin)

        // starting values but they will change
        var line_xpos = num_xpos + line_margin;
        var line_ypos = top_margin + header_height + clue_pt;

        var current_column = 0;
        var clues_in_column = 0;
        var lines_in_column = 0;
        var heading_pt = 0;
        skip_column = false;

        // clue_arrays = [ [ across ], [ down ] ]
        for (var k = 0; k < clue_arrays.length; k++) {
            var clues = clue_arrays[k];
            // clues is either [across] or [down]
            for (var i = 0; i < clues.length; i++) {
                var clue = clues[i];

                // check to see if we need to wrap
                var max_line_ypos;
                if (current_column < options.num_full_columns) {
                    // partial columns are on the right
                    max_line_ypos = DOC_HEIGHT - bottom_margin - options.copyright_pt;
                } else {
                    max_line_ypos = grid_ypos - options.grid_padding;
                }

                if (options.grid_placement == "left") {
                    // partial columns are on the left
                    if (current_column < (options.num_columns - options.num_full_columns)) {
                        max_line_ypos = grid_ypos - options.grid_padding;
                    } else {
                        max_line_ypos = DOC_HEIGHT - bottom_margin - options.copyright_pt;
                    }
                }

                // Split our clue
                var lines = split_text_to_size_bi(clue, col_clue_width, doc, options.clue_font, i == 0);

                // todo: why lines.length - 1? I think it's bceause line_ypos is
                // the bottom of the line being written
                if (line_ypos + (lines.length - 1) * (clue_pt + line_padding) > max_line_ypos) {
                    // move to new column, recompute padding for current column
                    column_clue_padding[current_column] =
                        ((max_line_ypos - (top_margin + header_height + heading_pt)) - ((lines_in_column) * (clue_pt + line_padding)))/(clues_in_column-1);
                    current_column += 1;

                    // march num_xpos forward
                    num_xpos += col_width + options.column_padding;
                    line_xpos = num_xpos + line_margin;
                    // reset line_ypos
                    line_ypos = top_margin + header_height + clue_pt;

                    clues_in_column = 0;
                    lines_in_column = 0;
                    heading_pt = 0;
                } else if (!lines[0] && (line_ypos + (4 * (clue_pt + line_padding)))> max_line_ypos) {
                    skip_column=true;
                    column_clue_padding[current_column] =
                        ((max_line_ypos - (top_margin + header_height + heading_pt)) - ((lines_in_column) * (clue_pt + line_padding)))/(clues_in_column-1);
                    current_column += 1;
                    num_xpos = side_margin + num_margin + current_column * (col_width + options.column_padding);
                    line_xpos = num_xpos + line_margin;
                    line_ypos = top_margin + header_height + clue_pt;

                    clues_in_column = 0;
                    lines_in_column = 0;
                    heading_pt = 0;
                }

                for (var j = 0; j < lines.length; j++) {
                    var line = lines[j];
                    lines_in_column++;

                    // don't allow first line in a column to be blank
                    if ((line_ypos == top_margin + header_height + clue_pt) && !line) {
                        line_ypos -= (clue_pt + clue_padding + line_padding);
                        lines_in_column--;
                        clues_in_column--;
                    }

                    // Set the font to bold for the title
                    // i.e. if this line contains a title, set heading_pt to
                    // some value so it can be used to add padding to the next
                    // column_clue_padding calculation.. I think
                    if (i == 0 && j == 0) {
                        heading_pt += 2;
                        line_ypos += clue_pt + line_padding + clue_padding + 2;
                        clues_in_column++;
                    } else {
                        line_ypos += clue_pt + line_padding;
                    }
                }

                clues_in_column++;
                line_ypos += clue_padding;
            }
        }

        column_clue_padding[current_column] =
            ((max_line_ypos - (top_margin + header_height)) - ((lines_in_column) * (clue_pt + line_padding)))
            / (clues_in_column - 1);

        // if clues won't fit, shrink the clue
        if (current_column > (options.num_columns - 1)) {
            //console.log("decreasing font size");
            if (current_column > options.num_columns) {
                clue_pt -= clue_pt / 10;
            } else {
                clue_pt -= clue_pt / 50;
            }

            clue_padding = clue_pt * options.clue_spacing;
        }

        // if clues don't take up all columns, increase clue size
        else if (current_column < options.num_columns -1) {
            //console.log("increasing font size");
            clue_pt += clue_pt / 10;
            clue_padding = clue_pt * options.clue_spacing;
        }

        // if the last column's clues are too spaced out, increase padding
        else if (
            (column_clue_padding[current_column] > spacing_strictness * column_clue_padding[current_column-1])
            && (clue_padding < 2*clue_pt))
        {
            //console.log("increasing clue padding");
            clue_padding += clue_pt / 20;
            emergency_button++;
            if (emergency_button > 20) {
                console.log("having issues, might prefer to change grid size");

                clue_pt = options.max_clue_pt;
                clue_padding = clue_pt * options.clue_spacing;
                spacing_strictness += 0.1;
                emergency_button = 0;
            }
        } else {
            // looks good!
            break;
        }
    }

    /********************/
    /* Write found grid */
    /********************/
    doc = new jsPDF(docOptions);
    doc.setFont(options.clue_font, "normal");
    doc.setFontSize(clue_pt);

    /* Render background image if there is one */
    if (options.bg_img) {
        var img_path = path.resolve(options.bg_img);
        let img = fs.readFileSync(img_path, {encoding: 'base64'});
        doc.addImage(img, "png", 0, 0, DOC_WIDTH, DOC_HEIGHT);
    }

    if (options.bg_color) {
        // Flood entire background
        const light_bg_padding = 10;
        doc.setFillColor(options.bg_color);
        doc.rect(
            side_margin - light_bg_padding, top_margin - light_bg_padding,
            DOC_WIDTH - side_margin * 2 + light_bg_padding*2,
            DOC_HEIGHT - top_margin - bottom_margin + light_bg_padding*2,
            'F');
    }

    /* Render logo if there is one - TODO(terry) changed this to filepath */
    if (options.logo) {
        let logo = fs.readFileSync(options.logo, {encoding: 'base64'});
        doc.addImage(logo, options.logoX, options.logoY, options.logoS, options.logoS);
    }

    // Same starting values as above.
    var num_margin = doc.getTextWidth('9'.repeat(max_clue_num_length));
    var num_xpos = side_margin + num_margin;
    var line_margin = 1.5 * doc.getTextWidth(' ');
    var line_xpos = num_xpos + line_margin;
    var line_ypos = top_margin + header_height + clue_pt;

    var current_column = 0;
    var clue_padding = column_clue_padding[0];
    var heading_pt = 0;

    if (manual_spacing) {
        clue_padding = clue_pt * options.clue_spacing;
        clue_pt = options.max_clue_pt;
    }

    for (var k = 0; k < clue_arrays.length; k++) {
        var clues = clue_arrays[k];
        var nums = num_arrays[k];

        for (var i = 0; i < clues.length; i++) {
            var clue = clues[i];
            var num = nums[i];

            // check to see if we need to wrap
            var max_line_ypos;
            if (current_column < options.num_full_columns) {
                // clues are left of grid (todo: what does copyright_pt have to
                // do with this?)
                max_line_ypos = DOC_HEIGHT - bottom_margin - options.copyright_pt;
            } else {
                // clues are below grid
                max_line_ypos = grid_ypos - options.grid_padding;
            }

            if (options.grid_placement == "left") {
                if (current_column < (options.num_columns - options.num_full_columns)) {
                    max_line_ypos = grid_ypos - options.grid_padding;
                } else {
                    max_line_ypos = DOC_HEIGHT - bottom_margin - options.copyright_pt;
                }
            }

            // Split our clue
            var lines = split_text_to_size_bi(clue, col_width - (num_margin + line_margin), doc, options.clue_font, i == 0);

            // todo(terry): janky: don't continue if it's the last column
            const last_column = current_column == options.num_columns - 1;
            if (!manual_spacing && !last_column
                && (( (line_ypos + ((lines.length - 1) * (clue_pt + line_padding))) > max_line_ypos + .001)
                || (!lines[0] && skip_column))) {

                // move to new column
                current_column += 1;
                num_xpos += col_width + options.column_padding;
                line_xpos = num_xpos + line_margin;
                line_ypos = top_margin + header_height + clue_pt;
                clue_padding = column_clue_padding[current_column];

                // infinity clue padding may happen when there is only 1 clue,
                // or there were columns generated during resizing that don't
                // exist anymore
                if (!isFinite(clue_padding) || isNaN(clue_padding)) {
                    console.log('infinity clue padding');
                    clue_padding = 0;
                }
                heading_pt = 0;

                var draw_ypos = line_ypos;
                if (current_column >= options.num_full_columns && options.grid_placement == 'top') {
                    // short column (under grid)
                    draw_ypos += grid_height + options.grid_padding - options.copyright_pt;
                }

                // if the padding is ridiculous, no vertical justification
                if (clue_padding > 2.5 * clue_pt) {
                    clue_padding = .5 * clue_pt;
                }
            }

            for (var j = 0; j < lines.length; j++) {
                var line = lines[j];

                // don't allow first line in a column to be blank
                if ((line_ypos == top_margin + header_height + clue_pt) && !line) {
                    line_ypos -= clue_pt + clue_padding + line_padding;
                    lines_in_column--;
                    clues_in_column--;
                }

                if (current_column >= options.num_full_columns && options.grid_placement == 'top') {
                    line_ypos += grid_height + options.grid_padding;
                }

                // Set the font to heading_style for "ACROSS"/"DOWN" headings
                if (i == 0 && j == 0) {
                    if (manual_spacing && k == 1) {
                        current_column += 1;
                        num_xpos = side_margin + num_margin + current_column * (col_width + options.column_padding);
                        line_xpos = num_xpos + line_margin;
                        line_ypos = top_margin + header_height + clue_pt;

                        if (current_column >= options.num_full_columns && options.grid_placement == 'top') {
                            line_ypos += grid_height + options.grid_padding;
                        }
                    }

                    // terry: changed this so headers aren't as big
                    heading_pt = 1;
                    line_ypos += heading_pt;

                    // Write heading (centered)
                    doc.setFontSize(clue_pt + heading_pt);
                    doc.setFont(options.clue_font, options.heading_style);
                    doc.text(line_xpos - (num_margin + line_margin) + (col_width / 2), line_ypos, line, { align: 'center' });
                    line_ypos += clue_pt + line_padding + clue_padding;

                    // Also print number (todo: can this be deduped with below?)
                    doc.setFontSize(clue_pt);
                    doc.setFont(options.clue_font, options.number_style);
                    doc.text(num_xpos, line_ypos, num,  null,  null,  "right");
                } else {
                    if (j == 0) {
                        // when j == 0 we print the number
                        doc.setFont(options.clue_font, options.number_style);
                        doc.text(num_xpos, line_ypos, num,  null,  null,  "right");
                    }

                    // Print the clue
                    doc.setFont(options.clue_font, 'normal');
                    printCharacters(doc, line, line_ypos, line_xpos, clue_pt, options.clue_font);
                    line_ypos += clue_pt + line_padding;
                }

                if (current_column >= options.num_full_columns && options.grid_placement == 'top') {
                    line_ypos -= (grid_height + options.grid_padding);
                }
            }

            line_ypos += clue_padding;
        }
    }

    /* Render title */
    if (options.my_font.length > 0) {
        doc.addFileToVFS("MyFont.ttf", options.my_font);
        doc.addFont("MyFont.ttf", "myFont", "bold");
    }

    doc.setFontSize(options.header_pt);
    doc.setFont(options.header_font, 'normal');
    doc.text(title_xpos, title_ypos, title, {align: xalign, baseline: baseline});

    /* Render right-header */
    if (options.right_header) {
        doc.setFontSize(options.header2_pt);
        doc.text(author_xpos, author_ypos, author, {align: author_align, baseline: baseline});
    }

    /* Render subheader */
    if (options.subheader && subheader_text) {
        doc.setFontSize(options.subheader_pt);
        doc.text(subheader_xpos, subheader_ypos, subheader_text, {align: subheader_align,  baseline: baseline});

    }

    /* Add headers to new page */
    if (options.columns == "new") {
        doc.addPage();

        /* Render logo if there is one */
        if (options.logo) {
            const imgProps = doc.getImageProperties(options.logo);
            doc.addImage(options.logo, options.logoX, options.logoY, options.logoS * imgProps.width, options.logoS * imgProps.height);
        }

        /* Render title */
        if (options.my_font.length > 0) {
            doc.addFileToVFS("MyFont.ttf", options.my_font);
            doc.addFont("MyFont.ttf", "myFont", "bold");
        }
        doc.setFontSize(options.header_pt);
        doc.setFont(options.header_font, 'bold');
        doc.text(title_xpos, title_ypos, title, {align: xalign, baseline: baseline});

        /* Render right-header */
        if (options.right_header) {
            doc.setFontSize(options.header2_pt);
            doc.text(author_xpos, author_ypos, author, {align: author_align, baseline: baseline});
        }

        /* Render subheader */
        if (options.subheader && subheader_text) {
            doc.setFontSize(options.subheader_pt);
            doc.text(subheader_xpos, subheader_ypos, subheader_text, {align: subheader_align, baseline: baseline});
        }
    }

    /* Draw grid */
    if (options.grid_placement == 'top') {
        grid_ypos = top_margin + header_height + 3;
    }

    /* Render copyright */
    if (options.copyright) {
        var copyright_text;

        if (options.copyright_text) {
            copyright_text = options.copyright_text;
        } else {
            copyright_text = xw.metadata.copyright;
        }

        doc.setFont(options.grid_font, 'bold');
        doc.setFontSize(options.copyright_pt);
        doc.setTextColor(80);

        var copyright_xpos;
        if (options.grid_placement == 'left') {
            copyright_xpos = side_margin + grid_width;
        } else {
            copyright_xpos = grid_xpos + grid_width;
        }

        var copyright_ypos;
        if (options.grid_placement == 'top') {
            copyright_ypos = top_margin + header_height + grid_height + options.border_width + options.copyright_pt + 3;
        } else {
            copyright_ypos = grid_ypos + grid_height + options.border_width + options.copyright_pt + 3;
        }

        const copyright_lines = doc.splitTextToSize(copyright_text, grid_width);
        if (copyright_lines.length > 1) {
            doc.text(grid_xpos, copyright_ypos, copyright_lines, null, null, 'left');
        } else {
            doc.text(copyright_xpos, copyright_ypos, copyright_lines, null, null, 'right');
        }

        doc.setTextColor(0);
    }

    var grid_options = {
        grid_letters: options.solution
    ,   grid_numbers: true
    ,   x0: grid_xpos
    ,   y0: grid_ypos
    ,   cell_size: grid_width / xw.metadata.width
    ,   grid_color: options.grid_color
    ,   shade: options.shade
    ,   circle_shade: options.circle_shade
    ,   line_width: options.line_width
    ,   border_width: options.border_width
    ,   border_color: options.border_color
    };

    doc.setFont(options.grid_font, 'bold');
    draw_crossword_grid(doc, xw, grid_options);

    if (options.columns == "new") {
        doc.movePage(2, 1);
    }

    if (options.output == 'preview') {
        PDFObject.embed(doc.output("bloburl"), "#example1");
    } else if (options.output == 'download') {
        doc.save(options.outfile);
    }
}

exports.draw_crossword_grid = draw_crossword_grid;
exports.puzdata_to_pdf = puzdata_to_pdf;
