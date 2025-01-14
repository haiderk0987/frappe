frappe.provide("frappe.report_utils");

frappe.report_utils = {
	make_chart_options: function (
		columns,
		raw_data,
		{ y_fields, x_field, chart_type, colors, height }
	) {
		const type = chart_type.toLowerCase();

		let rows = raw_data.result.filter((value) => Object.keys(value).length);

		let labels = get_column_values(x_field);
		let datasets = y_fields.map((y_field) => ({
			name: frappe.model.unscrub(y_field),
			values: get_column_values(y_field).map((d) => Number(d)),
		}));

		if (raw_data.add_total_row) {
			labels = labels.slice(0, -1);
			datasets.forEach((dataset) => {
				dataset.values = dataset.values.slice(0, -1);
			});
		}

		return {
			data: {
				labels: labels.length ? labels : null,
				datasets: datasets,
			},
			truncateLegends: 1,
			type: type,
			height: height ? height : 280,
			colors: colors,
			axisOptions: {
				shortenYAxisNumbers: 1,
				xAxisMode: "tick",
				numberFormatter: frappe.utils.format_chart_axis_number,
			},
		};

		function get_column_values(column_name) {
			if (Array.isArray(rows[0])) {
				let column_index = columns.findIndex((column) => column.fieldname == column_name);
				return rows.map((row) => row[column_index]);
			} else {
				return rows.map((row) => row[column_name]);
			}
		}
	},

	get_field_options_from_report: function (columns, data) {
		const rows = data.result.filter((value) => Object.keys(value).length);
		const first_row = Array.isArray(rows[0])
			? rows[0]
			: columns.map((col) => rows[0][col.fieldname]);

		const indices = first_row.reduce((accumulator, current_value, current_index) => {
			if (Number.isFinite(current_value)) {
				accumulator.push(current_index);
			}
			return accumulator;
		}, []);

		function get_options(fields) {
			return fields.map((field) => {
				if (field.fieldname) {
					return { label: field.label, value: field.fieldname };
				} else {
					field = frappe.report_utils.prepare_field_from_column(field);
					return { label: field.label, value: field.fieldname };
				}
			});
		}

		const numeric_fields = columns.filter((col, i) => indices.includes(i));
		const non_numeric_fields = columns.filter((col, i) => !indices.includes(i));

		let numeric_field_options = get_options(numeric_fields);
		let non_numeric_field_options = get_options(non_numeric_fields);

		return {
			numeric_fields: numeric_field_options,
			non_numeric_fields: non_numeric_field_options,
		};
	},

	prepare_field_from_column: function (column) {
		if (typeof column === "string") {
			if (column.includes(":")) {
				let [label, fieldtype, width] = column.split(":");
				let options;

				if (fieldtype.includes("/")) {
					[fieldtype, options] = fieldtype.split("/");
				}

				column = {
					label,
					fieldname: label,
					fieldtype,
					width,
					options,
				};
			} else {
				column = {
					label: column,
					fieldname: column,
					fieldtype: "Data",
				};
			}
		}
		return column;
	},

	get_report_filters: function (report_name) {
		if (frappe.query_reports[report_name]) {
			let filters = frappe.query_reports[report_name].filters;
			return Promise.resolve(filters);
		}

		return frappe
			.xcall("frappe.desk.query_report.get_script", {
				report_name: report_name,
			})
			.then((r) => {
				frappe.dom.eval(r.script || "");
				return frappe.after_ajax(() => {
					if (
						frappe.query_reports[report_name] &&
						!frappe.query_reports[report_name].filters &&
						r.filters
					) {
						return (frappe.query_reports[report_name].filters = r.filters);
					}
					return (
						frappe.query_reports[report_name] &&
						frappe.query_reports[report_name].filters
					);
				});
			});
	},

	get_filter_values(filters) {
		let filter_values = filters
			.map((f) => {
				var v = f.default;
				return {
					[f.fieldname]: v,
				};
			})
			.reduce((acc, f) => {
				Object.assign(acc, f);
				return acc;
			}, {});
		return filter_values;
	},

	get_result_of_fn(fn, values) {
		const get_result = {
			Minimum: (values) => values.reduce((min, val) => Math.min(min, val), values[0]),
			Maximum: (values) => values.reduce((min, val) => Math.max(min, val), values[0]),
			Average: (values) => values.reduce((a, b) => a + b, 0) / values.length,
			Sum: (values) => values.reduce((a, b) => a + b, 0),
		};
		return get_result[fn](values);
	},

	get_filters_html_for_print(applied_filters, fields_dict) {
		let filtered_items =  Object.keys(applied_filters).filter((fieldname) => {
			const df = fields_dict[fieldname];
			const value = applied_filters[fieldname];
			if (!value) {
				return false;
			}
			if (Array.isArray(value) && !value.length) {
				return false;
			}
			if (df && df.print_hide) {
				return false;
			}
			return true;
		}).map((fieldname) => {
			const df = fields_dict[fieldname];
			const value = applied_filters[fieldname];
			return `<div><b>${__(df.label)}</b>: ${frappe.format(value, df, null, applied_filters)}</div>`;
		});

		let column_size = Math.ceil(filtered_items.length / 3);
		let columns = [];

		for (let i = 0; i < filtered_items.length; i += column_size) {
			columns.push(filtered_items.slice(i, i + column_size));
		}

		let columns_with_container = columns.map((items) => {
			return `<div class="pull-left" style="width:33.33%;">${items.join("")}</div>`;
		});

		return columns_with_container.length ? `<div class="clearfix">${columns_with_container.join("")}</div>` : "";
	}
};
