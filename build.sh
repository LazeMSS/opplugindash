#!/bin/bash
# output data dir
dataDir="./docs/data/"
statsFile="${dataDir}stats.json"
pluginsFile="${dataDir}plugins.json"
localStatsSrc="https://lazemss.github.io/opplugindash/data/stats.json"
localPluginsSrc="https://lazemss.github.io/opplugindash/data/plugins.json"

pluginSrc="https://plugins.octoprint.org/plugins.json"
statsSrc="https://data.octoprint.org/export/plugin_stats_30d.json"

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
if [ ! -d "$dataDir" ]; then
	echo "Creating folder $dataDir"
	mkdir -p "$dataDir"
fi

# get local stats
curl -sS -f "$localPluginsSrc" --output "$statsFile"
curl -sS -f "$localStatsSr"c --output "$pluginsFile"
ls docs/data/

# Build new files
if [ ! -f "$statsFile" ]; then
	echo "{}" > $statsFile
fi
if [ ! -f "$pluginsFile" ]; then
	echo "{}" > $pluginsFile
fi

ls docs/data/
cat $pluginsFile

mapfile -t plugins < <(jq -cr '.[]' $configFile)
if [ ${#plugins[@]} -eq 0 ]; then
	errormsg "Zero entries found in $configFile"
	exit 1
fi
echo "Found ${#plugins[@]} plugin(s) in $configFile"

# get stats
curl -sS $pluginSrc --output plugins.json
curl -sS $statsSrc --output stats.json

statsTime=$(jq -cr '._generated' stats.json 2>&1)
statsTime=$(date -d "$statsTime" +"%Y-%m-%d")

# for pluginid in "${plugins[@]}"
# do
# 	echo "Gettings generic stats for $pluginid"
# 	if grep -q '"id": "'"$pluginid"'"' plugins.json; then

# 		# build generic stats/github stats
# 		jq '.[]| select(.id=="'"$pluginid"'")  | {"stats":.stats, "issues":.github|.issues , "stars":.github.stars} | {"'"${pluginid}"'" : {"'"$now"'": .}}' plugins.json > tmp_stats.json
# 		jq -s '.[0] * .[1]' tmp_stats.json $pluginsFile > tmp_merge.json
# 		mv tmp_merge.json $pluginsFile

# 		# Build version stats
# 		jq '.plugins.'${pluginid} stats.json | jq -c '{"'"${pluginid}"'" : {"'"$statsTime"'": .}}' > tmp_stats.json
# 		jq -s '.[0] * .[1]' tmp_stats.json $statsFile > tmp_merge.json
# 		mv tmp_merge.json $statsFile
# 	else
# 		errormsg "Could not locate $pluginid in $pluginSrc"
# 	fi
# done

configMap=$(jq -c '[ .[] | {key: (.), value: null} ] | from_entries' config.json)

# No checking whether config values exist in plugins.json here

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
mv tmp_merge.json $statsFile

rm plugins.json stats.json tmp_* 2> /dev/null

# copy config file to the website
cp $configFile ${dataDir}config.json
