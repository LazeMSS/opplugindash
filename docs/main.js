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
		buildLineGraph(clone.find('[data-graph="installs"]'),['Installs'],[0],totalStats[item],'Total installs');
		buildPieChart(clone.find('[data-graph="versions"]'),Object.keys(stats30d.plugins[item].versions),'instances',stats30d.plugins[item].versions,5,'Release version');
	}
}


function buildInfo(item){
	const myModal = new bootstrap.Modal('#detailModal');
	let litem = $(item).attr('href');
	$('#detailModalHeader').html($(item).closest('div.card').find('[data-pinfo="title"]').text() + " details...");
	xhrJson("json/details.json", function(data) {
		if (litem in data){
			localStats = data[litem];
			$('#detailInfo').html('');
			buildLineGraph($('#detailInfo'),['Installs'],[0],totalStats[litem],'Total installs');
			buildLineGraph($('#detailInfo'),['Monthly','Weekly'],['installbase.instances_month','installbase.instances_week'],localStats,'Instances');
			buildLineGraph($('#detailInfo'),['Monthly','Weekly'],['installbase.install_events_month','installbase.install_events_week'],localStats,'Install events');
			buildLineGraph($('#detailInfo'),['Open','Closed'],['ghissues.open','ghissues.closed'],localStats,'GitHub issues');
			buildLineGraph($('#detailInfo'),['Stars'],['ghstars'],localStats,'GitHub stars');
			buildPieChart($('#detailInfo'),Object.keys(stats30d.plugins[litem].versions),'instances',stats30d.plugins[litem].versions,0,'Release version');
			myModal.show();
		}
	})
	return false;
}

function buildLineGraph(target,labels,datakeys,datasrc,titleStr){
	var canvasitem = $('<canvas/>');
	let datasetsIns = [];
	let labelsGen = [];
	$.each(labels,function(index, element){
		datasetsIns.push(
			{label : element, data: []},
		);
	});

	// assign the value
	$.each(datasrc,function(keySrc,valueSrc){
		labelsGen.push(keySrc);
		$.each(datakeys,function(index, element){
			if (typeof element == "number"){
				if (Array.isArray(valueSrc)){
					datasetsIns[index].data.push(valueSrc[element]);
				}else{
					datasetsIns[index].data.push(valueSrc);
				}
			}else{
				datasetsIns[index].data.push(resolvePath(valueSrc,element));
			}
		})
	});

	target.append(canvasitem);

	var legendOptions = {
		display: true
	};
	if (datasetsIns.length == 1){
		legendOptions.display = false;
	}

	new Chart(canvasitem, {
		type: 'line',
		data: {
			labels: labelsGen,
			datasets: datasetsIns
		},
		options: {
			plugins: {
				title: {
					display: true,
					text: titleStr
				},
				legend: legendOptions
			}
		}
	});
}


function buildPieChart(target,dataLabels,keylookup,dataValues,limit,labeltxt){
	let finalValues = [];
	$.each(dataValues,function(datKey,datVal){
		finalValues.push(resolvePath(datVal,keylookup))
	});

	// Limit entries shown
	if (limit > 0){
		// Sort them - largest first
		let tempStats = [];
		$.each(finalValues,function(dataKey,datVal){
			tempStats.push([
				dataLabels[dataKey],
				datVal
			]);
		});
		tempStats.sort(function(a, b) {
			return b[1]-a[1];
		});

		// New set to be used
		let newSet = tempStats.slice(0, limit);

		// all the rest
		let other = 0;
		tempStats.slice(limit).forEach(function(curVal) {
			other += curVal[1];
		});
		if (other > 0) {
			newSet.push(['other',other]);
		}
		// Build the new entries
		finalValues = [];
		dataLabels = [];
		newSet.forEach(function(curVal) {
			dataLabels.push(curVal[0]);
			finalValues.push(curVal[1]);
		});
	}

	var canvasitem = $('<canvas/>');
	target.append(canvasitem);
	new Chart(canvasitem, {
		type: 'pie',
		data: {
			labels: dataLabels,
			datasets: [{
				label: labeltxt,
				data: finalValues,
				hoverOffset: 4
			}]
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