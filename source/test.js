
export function test_suite_new() {
	
	let tests = []
	let it = function(label, fn) {
		tests.push({ label: label, fn: fn })
	}
	return { tests, it }
}

export function test_suite_run(suite) {
	
	let { tests } = suite
	let result = true
	tests.forEach(function(each, index) {
		let result_ = each.fn()
		let label = each.label
		if (label == '') label = `test ${index}`
		console.log(`${result_ === true ? 'Passed test' : 'Failed test'} "${label}".`)
		if (result_ === false) result = false 
	})
	return result
}
