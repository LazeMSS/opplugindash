/*
Todo:
	Cleanup graph

	Drilldown stats for:
		installs, version and github stats pr. day
*/

//paths to json files
const configFile = "json/config.json"

// Store data for faster builds
var myPlugins = [];
var stats30d = {};
var pluginsinfo = {};
var localPlugins = {};
// Graph resize timer
var resizeTimer = null;

function toogleDarkMOde() {
	$('i.modeicon').toggleClass('bi-moon bi-sun');
	let newMode = ($('html').attr("data-bs-theme") == "dark") ? "light" : "dark"
	$('html').attr("data-bs-theme", newMode);
}

// ajax quick handler - needs an error handler
function xhrJson(url, callbackOk) {
	let xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = function() {
		if (this.readyState == 4 && this.status == 200) {
			callbackOk(JSON.parse(this.responseText));
		}
	};
	xmlhttp.open("GET", url, true);
	xmlhttp.send();
}

// load and refresh data
function loadData(refresh) {
	if (refresh) {
		alert("WIP");
		return;
		$('#fetchSpinner').removeClass('d-none');
	}


	// Get main config
	xhrJson(configFile, function(data) {
		myPlugins = data;
		// Get primary plugin info for names etc
		xhrJson("https://plugins.octoprint.org/plugins.json", function(data) {
			pluginsinfo = data;

			// Get the 30d stats / should be removed and replace with history stats only or as fallback
			xhrJson("https://data.octoprint.org/export/plugin_stats_30d.json", function(data) {
				stats30d = data;
				// Get history data and handle
				xhrJson("json/plugins.json", function(data) {
					localPlugins = data;
					buildStats();
				})
			});
		});
	});
}

function buildStats() {
	let tempPInfo = {};
	pluginsinfo.forEach(function(item) {
		let idLc = item.id.toLowerCase();
		if (myPlugins.includes(item.id) || myPlugins.includes(idLc)) {
			tempPInfo[idLc] = item;
		}
	});
	pluginsinfo = tempPInfo;
	myPlugins.forEach(buildPluginStat);
	$('#mainSpinner').remove();
	$('#mainDash,#fetchSpinner').removeClass('d-none');
	$('#fetchSpinner').addClass('d-none');
}

function buildPluginStat(item) {
	item = item.toLowerCase();
	if (item in stats30d.plugins) {
		// Basic template field from data
		let template = document.querySelector('#mainDashTemplate');
		let clone = template.content.cloneNode(true);
		// Find all plugin info data
		let templateFiller = clone.querySelectorAll('[data-pinfo]');
		templateFiller.forEach(function(curVal, curInd, listObj) {
			// Lookup the value in the tree
			let itemVal = resolvePath(pluginsinfo[item], curVal.getAttribute('data-pinfo'), null);
			// Nothing to fil - then delete the template item
			if (itemVal == null || itemVal === false) {
				listObj[curInd].remove();
				return;
			}

			// Set urls if a href tags
			if (listObj[curInd].tagName == "A") {
				listObj[curInd].setAttribute("href", itemVal.replace(/\/archive\/(.*)/, ''));
			} else {
				listObj[curInd].innerHTML = itemVal;
			}
		});


		// build pie chart of versions numbers
		let statKeys = [];
		let statVals = [];
		let tempStats = [];
		for (const [key, value] of Object.entries(stats30d.plugins[item].versions)) {
			tempStats.push({
				'ver': key,
				'val': value.instances
			});
		}
		tempStats.sort(function(a, b) {
			return b.val - a.val;
		});
		let newSet = tempStats.slice(0, 5)
		let other = 0;
		tempStats.slice(5).forEach(function(curVal) {
			other += curVal.val;
		});
		if (other > 0) {
			newSet.push({
				"ver": "other",
				"val": other
			});
		}
		newSet.forEach(function(curVal) {
			statKeys.push(curVal.ver);
			statVals.push(curVal.val);
		});
		let canvas = clone.querySelectorAll("canvas[data-graph=\"versions\"]")[0];
		canvas.setAttribute("id", "versiongraph_" + item);
		let dataSet = {
			labels: statKeys,
			datasets: [{
				label: 'Totals for ' + item,
				data: statVals,
				hoverOffset: 4
			}]
		};

		// Build graph with install base
		let canvasHis = clone.querySelectorAll("canvas[data-graph=\"history\"]")[0];
		if (item in localPlugins) {
			let hiskeys = [];
			let hisval = [];
			for (const [key, value] of Object.entries(localPlugins[item])) {
				hiskeys.push(key);
				hisval.push(value.stats.instances_month);
			}
			canvasHis.setAttribute("id", "histgraph_" + item);
			var histDatSet = {
				labels: hiskeys,
				datasets: [{
					label: "Total installbase",
					data: hisval
				}]
			};
		} else {
			canvasHis.remove();
			canvasHis = null;
		}
		// add the item
		document.querySelector('#mainDash').appendChild(clone);
		// Assign the graph
		new Chart(document.querySelector("#versiongraph_" + item), {
			type: 'pie',
			data: dataSet
		});
		// Assign the graph
		if (canvasHis != null) {
			new Chart(document.querySelector("#histgraph_" + item), {
				type: 'line',
				data: histDatSet,
				options: {
					plugins: {
						legend: {
							position: "bottom"
						}
					}
				}
			});
		}
	}
}

// Search and object for a string path
// https://stackoverflow.com/a/43849204
const resolvePath = (object, path, defaultValue) => path.split('.').reduce((o, p) => o ? o[p] : defaultValue, object);

// When ready lets load
$(function() {
	window.onresize = function() {
		if (resizeTimer != null) {
			clearTimeout(resizeTimer);
		}
		resizeTimer = setTimeout(function() {
			for (let id in Chart.instances) {
				Chart.instances[id].resize();
			}
		}, 100);
	}
	loadData(false);
});
