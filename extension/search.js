////////////////////////////// Document Elements //////////////////////////////

// input
var inputElement = document.createElement("INPUT")
inputElement.setAttribute("id", "inputSearch")
inputElement.setAttribute("autocomplete", "off")
document.documentElement.appendChild(inputElement)

// the line under the input
var grooveElement = document.createElement('DIV')
grooveElement.setAttribute('id', 'groove')
document.documentElement.appendChild(grooveElement)

// button for advanced options
var advancedButton = document.createElement("BUTTON")
advancedButton.setAttribute("id", "advancedButton")
advancedButton.setAttribute("class", "optionBtns")
document.documentElement.appendChild(advancedButton)
advancedButton.innerHTML = 'Advanced'

// groove for advanced button
var grAdvBtnElement = document.createElement('DIV')
grAdvBtnElement.setAttribute('id', 'grooveAdvBtn')
grAdvBtnElement.setAttribute('class', 'groove')
document.documentElement.appendChild(grAdvBtnElement)

var wordDistBtn = document.createElement('BUTTON')
wordDistBtn.setAttribute('id', 'wordDistBtn')
wordDistBtn.setAttribute("class", "optionBtns")
document.documentElement.appendChild(wordDistBtn)
wordDistBtn.innerHTML = 'Word Distance'

var grWordDist = document.createElement('DIV')
grWordDist.setAttribute('id', 'grWordDist')
grWordDist.setAttribute('class', 'groove')
document.documentElement.appendChild(grWordDist)

var wordDistInput = document.createElement('INPUT')
wordDistInput.setAttribute('id', 'inputSearch2')
wordDistInput.setAttribute('autocomplete' , 'off')
document.documentElement.appendChild(wordDistInput)

var grooveElement2 = document.createElement('DIV')
grooveElement2.setAttribute('id', 'groove2')
document.documentElement.appendChild(grooveElement2)

var regexBtn = document.createElement('BUTTON')
regexBtn.setAttribute('id', 'regexBtn')
regexBtn.setAttribute("class", "optionBtns")
document.documentElement.appendChild(regexBtn)
regexBtn.innerHTML = 'RegExp'

var grRegex = document.createElement('DIV')
grRegex.setAttribute('id', 'grRegex')
grRegex.setAttribute('class', 'groove')
document.documentElement.appendChild(grRegex)

var otherBtn = document.createElement('BUTTON')
otherBtn.setAttribute('id', 'otherBtn')
otherBtn.setAttribute("class", "optionBtns")
document.documentElement.appendChild(otherBtn)
otherBtn.innerHTML = 'Other'

var grOther = document.createElement('DIV')
grOther.setAttribute('id', 'grOther')
grOther.setAttribute('class', 'groove')
document.documentElement.appendChild(grOther)

// other button list
var other1 = document.createElement('BUTTON')
other1.setAttribute('id', 'other1')
other1.setAttribute('class', 'optionBtns')
document.documentElement.appendChild(other1)
other1.innerHTML = 'Word Size'

var other2 = document.createElement('BUTTON')
other2.setAttribute('id', 'other2')
other2.setAttribute('class', 'optionBtns')
document.documentElement.appendChild(other2)
other2.innerHTML = 'Find Email'

var resultsWin = document.createElement('DIV')
resultsWin.setAttribute('id', 'searchResults')
resultsWin.setAttribute('hidden', '')
document.documentElement.appendChild(resultsWin)

// visual occurences
var resultsDropdownBtn = document.createElement("BUTTON")
resultsDropdownBtn.setAttribute("id", "resultsDropdownBtn")
resultsDropdownBtn.setAttribute("class", "optionBtns")
document.documentElement.appendChild(resultsDropdownBtn)
resultsDropdownBtn.innerHTML = '...'

// dropdown btn groove
var grResultsDropdownBtn = document.createElement('DIV')
grResultsDropdownBtn.setAttribute('id', 'grResultsDropdownBtn')
grResultsDropdownBtn.setAttribute('class', 'groove')
document.documentElement.appendChild(grResultsDropdownBtn)

var result1 = document.createElement('DIV')
result1.setAttribute('id', 'result1')
result1.setAttribute("class", "optionBtns")
document.documentElement.appendChild(result1)

var result2 = document.createElement('DIV')
result2.setAttribute('id', 'result2')
result2.setAttribute("class", "optionBtns")
document.documentElement.appendChild(result2)

var result3 = document.createElement('DIV')
result3.setAttribute('id', 'result3')
result3.setAttribute("class", "optionBtns")
document.documentElement.appendChild(result3)
// result1.innerHTML = 

// regex box
var regexBox = document.createElement('DIV')
regexBox.setAttribute('id', 'regexBox')
document.documentElement.appendChild(regexBox)

var noResultsBox = document.createElement('DIV')
noResultsBox.setAttribute('id', 'noResultsBox')
document.documentElement.appendChild(noResultsBox)
noResultsBox.innerHTML = 'No results found'

// variables
var	textTag = document.body.innerHTML
	textArray = textTag.split('')
	inputTag = document.getElementById('inputSearch')
	searchResults = document.getElementById('searchResults')
	groove = document.getElementById('groove')
	resultsDropdownBtn = document.getElementById('resultsDropdownBtn')
	grResultsDropdownBtn = document.getElementById('grResultsDropdownBtn')
	regexBox = document.getElementById('regexBox')
	noResultsBox = document.getElementById('noResultsBox')
	wordDistPressed = ''
	regexPressed = ''

inputTag.setAttribute('placeholder', 'Find:')

////////////////////////////// listen for Enter key being pressed //////////////////////////////
inputTag.addEventListener('keyup', function(e) {
	input = inputTag.value
	e.preventDefault()
	if (e.keyCode == 13) {
		scroll(0,0)
		document.body.style.overflowY = 'hidden'
		// advancedButton.style.visibility = 'visible'
		// grAdvBtnElement.style.visibility = 'visible'		
		// wordDistBtn.style.visibility = 'visible'
		// grWordDist.style.visibility = 'visible'
		// regexBtn.style.visibility = 'visible'
		// grRegex.style.visibility = 'visible'
		// otherBtn.style.visibility = 'visible'
		// grOther.style.visibility = 'visible'
		if (inputTag.getAttribute('placeholder') == 'WD:') {
			wordDistance(inputTag.value, wordDistInput.value)
			wordDistPressed = 'false'
		}
		else if (inputTag.getAttribute('placeholder') == 'RegExp:') {
			regex(textTag, input)
			regexPressed = 'false'
			console.log('regexp pass')
		}
		else if (inputTag.getAttribute('placeholder') == 'WS:') {
			wordSize(input)
		}
		else if (inputTag.getAttribute('placeholder') == 'Find:') {
			resultsDropdownBtn.style.visibility = 'visible'
			grResultsDropdownBtn.style.visibility = 'visible'
			resultsDropdownBtn.style.animationName = 'showResultsOption'
			grResultsDropdownBtn.style.animationName = 'showResultsOption'
			noResultsBox.style.visibility = 'hidden'
	 		find(input)
		}
	}

	else if (e.keyCode == 9) {
		console.log('tab')
		wordDistInput.focus()
		wordDistInput.select()
	}
	else if (e.keyCode == 8 && noResultsBox.style.visibility == 'visible') {
		noResultsBox.style.visibility = 'hidden'
	} 
	// if (!(e.key == 'z' && e.ctrlKey) || !e.keyCode == 13) {
	// 	advancedButton.style.visibility = 'hidden'
	// 	grAdvBtnElement.style.visibility = 'hidden'		
	// 	wordDistBtn.style.visibility = 'hidden'
	// 	grWordDist.style.visibility = 'hidden'
	// 	regexBtn.style.visibility = 'hidden'
	// 	grRegex.style.visibility = 'hidden'
	// 	otherBtn.style.visibility = 'hidden'
	// 	grOther.style.visibility = 'hidden'
	// }
 // 	else {
 // 		console.log('pass')
 // 		if (wordDistInput.style.visibility == 'visible') {
 // 			console.log('pass 1')
	// 		wordDistance(inputTag.value, wordDistInput.value)
 // 		} else {
 //  			console.log('pass 2')
 // 			noResultsBox.style.visibility = 'hidden'
 // 			// find(input)
 // 		}
	// }
	return false
})

////////////////////////////// if Enter key is presed and there are two input (for word distance) //////////////////////////////
wordDistInput.addEventListener('keyup', function(e) {
	if (e.keyCode == 13 && wordDistInput.value != null) {
		wordDistance(inputTag.value, wordDistInput.value)
	}
	return false
})

////////////////////////////// crtl+z to show the interface //////////////////////////////
function visibility(e) {
	if (e.key == 'z' && e.ctrlKey && (pressed == undefined || pressed == false)) {
		inputTag.style.visibility = 'visible'
		inputTag.style.animationName = 'appearSearch'
		inputTag.focus()
		inputTag.select()
		groove.style.visibility = 'visible'
		groove.style.animationName = 'appearSearch'
		advancedButton.style.visibility = 'visible'
		advancedButton.style.animationName = 'appearSearch'
		grAdvBtnElement.style.visibility = 'visible'
		grAdvBtnElement.style.animationName = 'appearSearch'
		pressed = true
		timestamp = (new Date()).getTime()
	}

	// hide the interface is crtl+z is pressed again
	if (e.key == 'z' && e.ctrlKey && pressed) {
		var now = (new Date()).getTime()
			diff = now - timestamp
		if (diff > 400) {
			wordDistBtn.style.visibility = 'hidden'
			grWordDist.style.visibility = 'hidden'
			regexBtn.style.visibility = 'hidden'
			grRegex.style.visibility = 'hidden'
			otherBtn.style.visibility = 'hidden'
			grOther.style.visibility = 'hidden'
			wordDistInput.style.visibility = 'hidden'
			groove2.style.visibility = 'hidden'
			resultsDropdownBtn.style.visibility = 'hidden'
			grResultsDropdownBtn.style.visibility = 'hidden'
			regexBox.style.visibility = 'hidden'
			inputTag.style.animationName = 'disappearSearch'
			groove.style.animationName = 'disappearSearch'
			advancedButton.style.animationName = 'disappearSearch'
			grAdvBtnElement.style.animationName = 'disappearSearch'
			setTimeout(function() {
				inputTag.style.visibility = 'hidden'
				groove.style.visibility = 'hidden'
				advancedButton.style.visibility = 'hidden'
				grAdvBtnElement.style.visibility = 'hidden'
			}, 1000)
			pressed = false
		}
	} 
}

function resetAnimation(id) {
	var el = document.getElementById(id);
	el.style.animation = 'none';
	el.offsetHeight; /* trigger reflow */
	el.style.animation = null; 
  }

var pressed, timestamp
inputTag.addEventListener('keyup', function(e) {
	visibility(e)
})

document.body.addEventListener('keyup', function(e) {
	visibility(e)
})

advancedButton.onclick = function() {
	wordDistInput.style.visibility = 'hidden'
	grooveElement2.style.visibility = 'hidden'
	if (wordDistBtn.style.visibility == 'visible') {
		wordDistBtn.style.visibility = 'hidden'
		grWordDist.style.visibility = 'hidden'
		regexBtn.style.visibility = 'hidden'
		grRegex.style.visibility = 'hidden'
		otherBtn.style.visibility = 'hidden'
		grOther.style.visibility = 'hidden'
		inputTag.setAttribute('placeholder', 'Find:')
	} else {
		resetAnimation('wordDistBtn')
		resetAnimation('grWordDist')
		wordDistBtn.style.visibility = 'visible'
		grWordDist.style.visibility = 'visible'
		wordDistBtn.style.animationName = 'appearFirstOption'
		grWordDist.style.animationName = 'appearFirstOption'

		// animations for the dropdown
		setTimeout(() => {
			resetAnimation('regexBtn')
			resetAnimation('grRegex')	
			regexBtn.style.visibility = 'visible'
			grRegex.style.visibility = 'visible'
			regexBtn.style.animationName = 'dropSecondOption'
			grRegex.style.animationName = 'dropSecondOptionGroove'
		}, 500)

		setTimeout(() => {
			resetAnimation('otherBtn')
			resetAnimation('grOther')
			otherBtn.style.visibility = 'visible'
			grOther.style.visibility = 'visible'
			otherBtn.style.animationName = 'dropThirdOption'
			grOther.style.animationName = 'dropThirdOptionGroove'
		}, 1000)
	}
}

wordDistBtn.onclick = function() {
	resetAnimation('inputSearch2')
	resetAnimation('groove2')
	regexBox.style.visibility = 'hidden'
	noResultsBox.style.visibility = 'hidden'
	result1.setAttribute('hidden', '')
	result2.setAttribute('hidden', '')
	result3.setAttribute('hidden', '')
	inputTag.value = ''
	if (wordDistInput.style.visibility == 'visible') {
		wordDistInput.style.visibility = 'hidden'
		groove2.style.visibility = 'hidden'
		resultsDropdownBtn.style.visibility = 'visible'
		grResultsDropdownBtn.style.visibility = 'visible'
		inputTag.setAttribute('placeholder', 'Find:')	
	} else {
		wordDistInput.style.visibility = 'visible'
		groove2.style.visibility = 'visible'
		resultsDropdownBtn.style.visibility = 'hidden'
		grResultsDropdownBtn.style.visibility = 'hidden'
		wordDistInput.style.animationName = 'appearSecondInput'
		groove2.style.animationName = 'appearSecondInput'
		wordDistPressed = 'true'
		inputSearch2.focus()
		inputSearch2.select()
		inputTag.setAttribute('placeholder', 'WD:')
	}
}

regexBtn.onclick = function() {
	noResultsBox.style.visibility = 'hidden'
	inputTag.focus()
	inputTag.select()
	inputTag.value = ''
	inputTag.setAttribute('placeholder', 'RegExp:')
	inputTag.setSelectionRange(1, 1)
	wordDistInput.style.visibility = 'hidden'
	groove2.style.visibility = 'hidden'
	result1.setAttribute('hidden', '')
	result2.setAttribute('hidden', '')
	result3.setAttribute('hidden', '')
	resultsDropdownBtn.style.visibility = 'visible'
	grResultsDropdownBtn.style.visibility = 'visible'
	regexPressed = 'true'
	if (regexBox.style.visibility == 'visible') {
		regexBox.style.visibility = 'hidden'
		inputTag.setAttribute('placeholder', 'Find:')
	}
}

otherBtn.onclick = function() {
	regexBox.style.visibility = 'hidden'
	noResultsBox.style.visibility = 'hidden'
	result1.setAttribute('hidden', '')
	result2.setAttribute('hidden', '')
	result3.setAttribute('hidden', '')
	if (other1.style.visibility == 'visible') {
		other1.setAttribute('hidden', '')
		other2.setAttribute('hidden', '')
	} else {
		other1.removeAttribute('hidden')
		other2.removeAttribute('hidden')
	}
	other1.style.visibility = 'visible'
	other2.style.visibility = 'visible'
}

// word size function
other1.onclick = function() {
	inputTag.select()
	inputTag.setAttribute('placeholder', 'WS:')
}
// find email function (not fully working)
other2.onclick = function() {
	var localTextArray = textTag.split(' ')
	for (i = 0; i < localTextArray.length; i++) {
		console.log(localTextArray)
		if (localTextArray[i].match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) && !localTextArray[i].includes('href')) {
			console.log("email: " + localTextArray[i].match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
			let email = localTextArray[i].substring(localTextArray[i].indexOf('>') + 1, localTextArray[i].indexOf('<'))
				preString = localTextArray[i].substring(0, localTextArray[i].indexOf('>') + 1)
				postString = localTextArray[i].substring(localTextArray[i].indexOf('<'))
			console.log(preString, email, postString)
			// localTextArray[i] = preString + "<mark class='marks'>"  + email + "</mark>" + postString
			localTextArray[i] = "<mark class='marks'>"  + localTextArray[i].match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) + "</mark>"
		}
	}
	document.getElementsByTagName('body')[0].style.filter = 'blur(7px)'
	searchResults.removeAttribute('hidden')
	searchResults.innerHTML = localTextArray.join(' ')

	if (document.getElementsByClassName('marks')[0] != undefined) {
		let positonY = document.getElementsByClassName('marks')[0].getBoundingClientRect().bottom
		searchResults.scrollTop = positonY -  250
	}

}
// make it from ... to ... #nr of characters 
function wordSize(size) {
	noResultsBox.style.visibility = 'hidden'
	var localTextArray = textTag.split(' ')
	for (i = 0; i < localTextArray.length; i++) {
		if (parseInt(size) == localTextArray[i].length && document.body.innerText.split(' ').includes(localTextArray[i])) {
			localTextArray[i] = "<mark class='marks'>"  + localTextArray[i] + "</mark>"
			console.log(parseInt(size), localTextArray[i].length, localTextArray[i])			
		}
	}
	document.getElementsByTagName('body')[0].style.filter = 'blur(7px)'
	searchResults.removeAttribute('hidden')
	searchResults.innerHTML = localTextArray.join(' ')
}

var results = []
	stringPosition = []
function find(str) {
	results = []
	var localTextArray = textTag.split('')
		occurrences = 0
		cntr = 1
	// add occurences feature
	let	stringLocation = []
	for (i = 0; i < localTextArray.length; i++) {
		var potentialString
		if (localTextArray[i] == str.substring(0, 1)) {
			for (j = 0; j < str.length; j++) {
				potentialString += localTextArray[i+j]
			}
			// console.log('1: ' + potentialString)
			if (potentialString.length > str.length) {
				potentialString = potentialString.substring(potentialString.length - str.length, potentialString.length)
			}
			if (potentialString == str) {
				if (localTextArray[i-1] != '>' && localTextArray[i-1] != '_' && localTextArray[i-1] != '/') {
					stringLocation.push(i + ', ' + (i+j))
					localTextArray[i] = "<mark class='marks'>" + localTextArray[i]
					localTextArray[i+j-1] = localTextArray[i+j-1] + "</mark>"
					occurrences++
				}
			}
		}
		if (i == localTextArray.length - 1 && occurrences == 0) {
			noResultsBox.style.visibility = 'visible'
			resultsDropdownBtn.style.visibility = 'hidden'
			grResultsDropdownBtn.style.visibility = 'hidden'
			searchResults.style.visibility = 'hidden'
			document.getElementsByTagName('body')[0].style.filter = 'blur(0px)'
			inputTag.select()
		} else {
			resultsDropdownBtn.style.visibility = 'visible'
			grResultsDropdownBtn.style.visibility = 'visible'
			searchResults.style.visibility = 'visible'
			document.getElementsByTagName('body')[0].style.filter = 'blur(7px)'
		}
	}
	// add green highlight over the found words
	result = ''
	var breakStart = 0
	for (i = 0; i < 3; i++) {
		let	htmlTextArray = document.body.innerText.split(' ')
		for (j = breakStart; j < htmlTextArray.length; j++) {
			if (htmlTextArray[j] == str) {
				result = htmlTextArray[j-3] + ' ' + htmlTextArray[j-2] + ' ' + htmlTextArray[j-1] +
						 " <mark class='marks'>" + str + "</mark> " +
						 htmlTextArray[j+1] + ' ' + htmlTextArray[j+2] + ' ' + htmlTextArray[j+3]
				breakStart = j + 1
				break
			}
		}
		results.push(result)
		result = ''
	}

	searchResults.removeAttribute('hidden')
	searchResults.innerHTML = localTextArray.join('')

	c=0
	while (c < occurrences-1 && document.getElementsByClassName('marks').length != 0) {
		if (document.getElementsByClassName('marks')[c] != undefined) {
			let elementPosition = document.getElementsByClassName('marks')[c].getBoundingClientRect()
			stringPosition.push(elementPosition.top)
		}
		c++
	}

	if (result1.style.visibility == 'visible') {
		console.log('pass')
		showResults()
	}
	searchResults.scrollTop = stringPosition[0]
}


function wordDistance(word1, word2) {
	noResultsBox.style.visibility = 'hidden'
	let word1Location = []
		word2Location = []
		shortestWordDistance = []
		localTextArray = textTag.split('')
	// first word	
	for (i = 0; i < localTextArray.length; i++) {
		if (localTextArray[i] == word1.substring(0, 1)) {
			var potentialString
			for (j = 0; j < word1.length; j++) {
				potentialString += localTextArray[i+j]
			}
			if (potentialString.length > word1.length) {
				potentialString = potentialString.substring(potentialString.length - word1.length, potentialString.length)
			}
			if (potentialString == word1) {
				if (localTextArray[i-1] != '>' && localTextArray[i-1] != '_' && localTextArray[i-1] != '/') {
					let wordlength = parseInt(i) + parseInt(word1.length -1)
					word1Location.push(i + "," + wordlength)
				}
			}
		}
	}
	// second word
	for (i = 0; i < localTextArray.length; i++) {
		if (localTextArray[i] == word2.substring(0, 1)) {
			var potentialString
			for (j = 0; j < word2.length; j++) {
				potentialString += localTextArray[i+j]
			}
			if (potentialString.length > word2.length) {
				potentialString = potentialString.substring(potentialString.length - word2.length, potentialString.length)
			}
			if (potentialString == word2) {
				if (localTextArray[i-1] != '>' && localTextArray[i-1] != '_' && localTextArray[i-1] != '/') {
					let wordlength = parseInt(i) + parseInt(word2.length -1)
					word2Location.push(i + "," + wordlength)
				}
			}
		}
	} 
	let lowestDistance
		closestWordsIndex = []
	for (i = 0; i < word1Location.length; i++) {
		for (j = 0; j < word2Location.length; j++) {
			if (word1Location[i] != null && word2Location[j] != null) {
				let d1 = word1Location[i].split(',')[0]
					d2 = word2Location[j].split(',')[0]

				var distance = Math.abs(d1-d2)
				if (distance < Math.min(...shortestWordDistance) || i > 1000) {
					lowestDistance = distance
					closestWordsIndex[0] = word1Location[i]
					closestWordsIndex[1] = word2Location[j]
					console.log(word1Location[i], word1Location[j])
					console.log('current lowest distance: ' + lowestDistance)
				} 
				shortestWordDistance.push(distance)
			}
		}
	}

	// its possible to implement a dropdown list for the 1st, 2nd 3rd ... pair of words
	// similarly for find()
	if (closestWordsIndex[0] == undefined) {
		noResultsBox.style.visibility = 'visible'
		wordDistInput.style.visibility = 'hidden'
		grooveElement2.style.visibility = 'hidden'
		// noResultsBox.style.top = '115px'
		// noResultsBox.style.left = '300px'
	} else {
		let start1 = closestWordsIndex[0].split(',')[0]
			end1 = closestWordsIndex[0].split(',')[1]
			start2 = closestWordsIndex[1].split(',')[0]
			end2 = closestWordsIndex[1].split(',')[1]

			localTextArray[start1] = "<mark class='marks'>" + localTextArray[start1]
			localTextArray[end1] = localTextArray[end1] + "</mark>"
		
			localTextArray[start2] = "<mark class='marks'>" + localTextArray[start2]
			localTextArray[end2] = localTextArray[end2] + "</mark>"
		
			// show the results and blur the background
			document.getElementsByTagName('body')[0].style.filter = 'blur(7px)'
			searchResults.removeAttribute('hidden')
			searchResults.innerHTML = localTextArray.join('')
		
			// scroll to the position of the words
			let positonY = document.getElementsByClassName('marks')[0].getBoundingClientRect().bottom
			searchResults.scrollTop = positonY -  250
	}

}


function regex(text, re) {
	//remove marks from WD
	let flags = re.split('/')[2]
	re = re.split('/')[1]
	console.log(flags)
	let r = new RegExp(re, flags)
	    rBoolean = text.match(r)
	regexBox.style.visibility = 'visible'
	noResultsBox.style.visibility = 'hidden'
	if (rBoolean) {
		regexBox.innerHTML = '<b>RegExp Results</b><br><br>RegExp is true for <i>' + re			
		if (flags.includes('i') && flags.includes('g')) {
			let caps = 0
			for (i = 0; i < rBoolean.length; i++) {
				if (rBoolean[i].charAt(0) == rBoolean[i].charAt(0).toUpperCase()) {
					caps++
				}
			}
			regexBox.innerHTML += ' </i><br><i>' + caps + '</i> strings where found with a capital letter'
		}
		if (flags.includes('g')) {
			regexBox.innerHTML += ' </i><br><i>' + rBoolean.length + '</i> occurrences were found'
		}
	} else {
		regexBox.innerHTML = '<b>RegExp Results</b><br><br>The given RegExp returns false'
	}
}

function wordLocationFinder(text, wordLocation) {
	// i, i+j -> string 
	var	word = ""
	if (wordLocation != null) {
		let start = wordLocation.split(',')[0]
		    end = wordLocation.split(',')[1]

		for (k = start; k < (+end + +1); k++) {
			word += text[k]
		}
	}
	return word
}


// not called yet because it does not work
function removeMark(text) {
	var occurrences = text.match(new RegExp('<mark', 'g')).length
	for (i = 0; i < occurrences; i++) {
		marks[i].style.backgroundColor = 'transparent'
	}
} 


// results page mods
searchResults.ondblclick = () => {
	document.body.style.overflowY = 'visible'
	document.getElementsByTagName('body')[0].style.filter = 'blur(0px)'
	searchResults.setAttribute('hidden', '')
	result1.setAttribute('hidden', '')
	result2.setAttribute('hidden', '')
	result3.setAttribute('hidden', '')
	inputTag.focus()
	inputTag.select()
}

function showResults() {
	noResultsBox.style.visibility = 'hidden'
	regexBox.style.visibility = 'hidden'
	console.log(results)
	if (inputTag.value != '' && results.length != 0) {
		console.log('pass')
		resultsDropdownBtn.style.visibility = 'hidden'
		grResultsDropdownBtn.style.visibility = 'hidden'

		result1.removeAttribute('hidden')
		result1.style.visibility = 'visible'
		result1.innerHTML = results[0]
		result2.removeAttribute('hidden')
		result2.style.visibility = 'visible'
		result2.innerHTML = results[1]
		result3.removeAttribute('hidden')
		result3.style.visibility = 'visible'
		result3.innerHTML = results[2]
	}
}

resultsDropdownBtn.onclick = () => {
	showResults()
}

result1.onclick = () => {
	var scrollPos = window.scrollY
	searchResults.scrollBy(0, stringPosition[0] - searchResults.scrollTop)
}

result2.onclick = () => {
	var scrollPos = window.scrollY
	searchResults.scrollBy(0, stringPosition[1] - searchResults.scrollTop)
}

result3.onclick = () => {
	var scrollPos = window.scrollY
	searchResults.scrollBy(0, stringPosition[2] - searchResults.scrollTop)
}



// autocomplete

var wordSuggestions = [ { label:'', value:''}]
	siteText = document.body.innerText.toLowerCase().split(' ')
	words = [... new Set(siteText)]
	illegalChars = '.,/;<>\\:"()*&^%$#@!-[]'

for (i = 0; i < words.length; i++) {
	if (!illegalChars.split('').includes(words[i].slice(-1)) && !words[i].includes('\n')) {
		wordSuggestions.push({
			label: words[i],
			value: '-'
		})		
	}
}

autocomplete({
    input: inputTag,
    fetch: function(text, update) {
        text = inputTag.value.toLowerCase();
        // you can also use AJAX requests instead of preloaded data
        var suggestions = wordSuggestions.filter(n => n.label.toLowerCase().startsWith(text))
        update(suggestions);
    },
    onSelect: function(item) {
        input.value = item.label;
    }
});