/*
Todo:
	Cleanup graph
	use $ instead of native js

	Drilldown stats for:
		installs, version and github stats pr. day
*/

//paths to json files
const configFile = "json/config.json"

// Store data for faster builds
var myPlugins = [];
var pluginsinfo = {};
var stats30d = {};

var totalStats = {};
var localStats = {};

// Graph resize timer
var resizeTimer = null;
const now = new Date().toISOString().substr(0, 10);

function toogleDarkMOde() {
	$('i.modeicon').toggleClass('bi-moon bi-sun');
	let newMode = ($('html').attr("data-bs-theme") == "dark") ? "light" : "dark"
	$('html').attr("data-bs-theme", newMode);
}

// ajax quick handler - needs an error handler
function xhrJson(url, callbackOk) {
	if (url.includes("?")){
		url += "&time=";
	}else{
		url += "?time=";
	}
	url += now;
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
				xhrJson("json/totals.json", function(data) {
					totalStats = data;
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
		// Find all plugin info data
		let clone = $('#mainDashTemplate').clone().contents();

		clone.find('[data-pinfo]').each(function(curInd,element) {
			// Lookup the value in the tree
			let itemVal = resolvePath(pluginsinfo[item], $(this).attr('data-pinfo'), null);
			// Nothing to fil - then delete the template item
			if (itemVal == null || itemVal === false) {
				$(this).remove();
				return;
			}

			// Set urls if a href tags
			if (this.tagName == "A") {
				$(this).attr("href", itemVal.replace(/\/archive\/(.*)/, ''));
			} else {
				$(this).html(itemVal);
			}
		});
		$('#mainDash').append(clone);

		// Build install graphs now
		buildLineGraph(clone.find('[data-graph="installs"]'),['Installs'],[0],totalStats[item]);
		/*buildPieChart(clone.find('[data-graph="versions"]'),['instances'],stats30d.plugins[item].versions);
		return;*/

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
		let dataSet = {
			labels: statKeys,
			datasets: [{
				label: 'Totals for ' + item,
				data: statVals,
				hoverOffset: 4
			}]
		};
		// Assign the graph
		new Chart(clone.find('[data-graph="versions"]'), {
			type: 'pie',
			data: dataSet
		});
	}
}

function buildPieChart(target,datakeys,datavalues,limit){
	console.log(datakeys);
	console.log(datavalues)

	var canvasitem = $('<canvas/>');
	target.append(canvasitem);
	new Chart(canvasitem, {
		type: 'pie',
		data: {
			labels: datakeys,
			datasets: [{
				label: 'Totals for ',
				data: datavalues,
				hoverOffset: 4
			}]
		}
	});
}

function buildInfo(item){
	let litem = $(item).attr('href');
	xhrJson("json/details.json", function(data) {
		if (litem in data){
			localStats = data[litem];
			$('#detailInfo').html('');
			buildLineGraph($('#detailInfo'),['Installs'],[0],totalStats[litem]);
			buildLineGraph($('#detailInfo'),['instances_month','instances_week'],['installbase.instances_month','installbase.instances_week'],localStats);
			buildLineGraph($('#detailInfo'),['install_events_month','install_events_week'],['installbase.install_events_month','installbase.install_events_week'],localStats);
			buildLineGraph($('#detailInfo'),['Open issues','Closed issues'],['ghissues.open','ghissues.closed'],localStats);
			buildLineGraph($('#detailInfo'),['Stars'],['ghstars'],localStats);
		}
	})
	return false;
}

function buildLineGraph(target,labels,datakeys,datasrc){
	var canvasitem = $('<canvas/>');
	let datasetsIns = [];
	let labelsGen = [];
	$.each(labels,function(index, element){
		datasetsIns.push(
			{label : element, data: []},
		);
	});

	// assign the value
	for (const [key, value] of Object.entries(datasrc)) {
		labelsGen.push(key);
		$.each(datakeys,function(index, element){
			if (typeof element == "number"){
				if (Array.isArray(value)){
					datasetsIns[index].data.push(value[element]);
				}else{
					datasetsIns[index].data.push(value);
				}
			}else{
				datasetsIns[index].data.push(resolvePath(value,element));
			}
		})
	}
	target.append(canvasitem);

	new Chart(canvasitem, {
		type: 'line',
		data: {
			labels: labelsGen,
			datasets: datasetsIns
		}
	});
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