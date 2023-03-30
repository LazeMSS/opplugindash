#!/bin/bash

# local repo folder for www content
dataDir="./docs/"

# where should we store the json relative to the datadir
jsonDir="json/"

# octoprint download dirs
pluginSrc="https://plugins.octoprint.org/plugins.json"
statsSrc="https://data.octoprint.org/export/plugin_stats_30d.json"

# local save for json files for uploading later on
statsFile="${dataDir}${jsonDir}stats.json"
pluginsFile="${dataDir}${jsonDir}plugins.json"

# previous files
localStatsSrc="https://lazemss.github.io/opplugindash/${jsonDir}stats.json"
localPluginsSrc="https://lazemss.github.io/opplugindash/${jsonDir}plugins.json"

# users config file
configFile="./config.json"

now=$(date +'%Y-%m-%d-%s 1')

errormsg(){
	echo -e "\e[0;31m"Error: "\e[0m""$1"
}

# Config file found
if [ ! -f $configFile ]; then
	errormsg "Unable to find plugin configfile: $configFile"
	exit 1
fi

# check for jq
if ! command -v jq &> /dev/null; then
	apt-get install jq
fi

# check dir
if [ ! -d "${dataDir}${jsonDir}" ]; then
	echo "Creating folder ${dataDir}${jsonDir}"
	mkdir -p "${dataDir}${jsonDir}"
fi

# get current files local gh pages
curl -sS -f "$localPluginsSrc" --output "$statsFile"
curl -sS -f "$localStatsSrc" --output "$pluginsFile"

# Build new files if nothing was found
if [ ! -f "$statsFile" ]; then
	echo "{}" > $statsFile
fi
if [ ! -f "$pluginsFile" ]; then
	echo "{}" > $pluginsFile
fi

mapfile -t plugins < <(jq -cr '.[]' $configFile)
if [ ${#plugins[@]} -eq 0 ]; then
	errormsg "Zero entries found in $configFile"
	exit 1
fi
echo "Found ${#plugins[@]} plugin(s) in $configFile"


# get octoprint data
curl -sS $pluginSrc --output plugins.json
curl -sS $statsSrc --output stats.json

# get stats timestamp
statsTime=$(jq -cr '._generated' stats.json 2>&1)
statsTime=$(date -d "$statsTime" +"%Y-%m-%d")

# convert config to object to make it parsable
configMap=$(jq -c '[ .[] | {key: (.), value: null} ] | from_entries' config.json)

# build generic stats/github stats
jq --argjson config "$configMap" --arg now "$now" --slurpfile result "$pluginsFile" '
	[
		.[] | select(.id | in($config)) |
		{
			(.id): {
				($now): {
						"stats": (.stats),
						"issues": (.github.issues),
						"stars": (.github.stars)
						}
			}
		}
	] | reduce .[] as $add ($result[0]; . * $add)' plugins.json > tmp_merge.json
mv tmp_merge.json "$pluginsFile"

# Build version stats
jq --argjson config "$configMap" --arg statsTime "$statsTime" --slurpfile result "$statsFile" '
	[
	.plugins | to_entries | .[] | select(.key | in($config)) |
		{
			(.key): {
				($statsTime): (.value)
			}
	}
	] | reduce .[] as $add ($result[0]; . * $add)' stats.json > tmp_merge.json

# Copy to final output
mv tmp_merge.json $statsFile

rm plugins.json stats.json tmp_* 2> /dev/null

# copy config file to the website
cp $configFile ${dataDir}config.json
