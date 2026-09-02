"""
Curated company coding-problem bank.

Each entry maps a normalised lowercase company name to a list of problems
that are commonly asked at that company.  Each problem has:

  title      : str   – canonical problem title (like on LeetCode)
  difficulty : str   – "easy" | "medium" | "hard"
  topics     : list  – algorithmic topics (used in the LLM user prompt)
  description: str   – 1-sentence hint the LLM can elaborate on

This bank is merged with company_intel.coding_problems (from web research)
before being passed to the LLM.  The LLM is instructed to prefer these.
"""
from __future__ import annotations

COMPANY_PROBLEM_BANK: dict[str, list[dict]] = {

    # ── Tier 1 Big Tech ──────────────────────────────────────────────────────

    "google": [
        {"title": "Word Ladder",                    "difficulty": "hard",   "topics": ["BFS", "graph", "string"],              "description": "Find shortest word transformation sequence from beginWord to endWord."},
        {"title": "LRU Cache",                      "difficulty": "medium", "topics": ["design", "hash map", "doubly linked list"], "description": "Implement an LRU cache with O(1) get and put."},
        {"title": "Median of Two Sorted Arrays",    "difficulty": "hard",   "topics": ["binary search", "array"],               "description": "Find the median of two sorted arrays in O(log(m+n))."},
        {"title": "Trapping Rain Water",            "difficulty": "hard",   "topics": ["stack", "two pointer", "array"],        "description": "Compute total water trapped between bars."},
        {"title": "Valid Parentheses",              "difficulty": "easy",   "topics": ["stack", "string"],                      "description": "Determine if a string of brackets is valid."},
        {"title": "Meeting Rooms II",               "difficulty": "medium", "topics": ["heap", "interval", "greedy"],           "description": "Find minimum number of conference rooms required."},
        {"title": "Serialize and Deserialize Binary Tree", "difficulty": "hard", "topics": ["tree", "DFS", "BFS", "design"],   "description": "Design an algorithm to serialize and deserialize a binary tree."},
        {"title": "Jump Game II",                   "difficulty": "medium", "topics": ["greedy", "dynamic programming"],        "description": "Find the minimum number of jumps to reach the end of the array."},
        {"title": "Count Vowels in a String",       "difficulty": "easy",   "topics": ["string", "array"],                     "description": "Count the number of vowels (a,e,i,o,u) in a given string."},
        {"title": "Find Anagrams in a String",      "difficulty": "medium", "topics": ["sliding window", "hash map", "string"], "description": "Find all start indices of anagram substrings in s."},
    ],

    "meta": [
        {"title": "Accounts Merge",                 "difficulty": "medium", "topics": ["union find", "DFS", "graph"],           "description": "Merge accounts that share common emails."},
        {"title": "Basic Calculator II",            "difficulty": "medium", "topics": ["stack", "string"],                      "description": "Evaluate a string expression with +, -, *, /."},
        {"title": "Minimum Window Substring",       "difficulty": "hard",   "topics": ["sliding window", "hash map"],           "description": "Find the minimum window containing all characters of t."},
        {"title": "Binary Tree Right Side View",    "difficulty": "medium", "topics": ["BFS", "tree"],                          "description": "Return nodes visible from the right side of a binary tree."},
        {"title": "Dot Product of Two Sparse Vectors", "difficulty": "medium", "topics": ["array", "hash map", "design"],      "description": "Compute dot product of two sparse vectors efficiently."},
        {"title": "Subarray Sum Equals K",          "difficulty": "medium", "topics": ["prefix sum", "hash map"],               "description": "Count subarrays whose elements sum to k."},
        {"title": "Expression Add Operators",       "difficulty": "hard",   "topics": ["DFS", "backtracking", "string"],        "description": "Add operators to digits to evaluate to a target value."},
        {"title": "Palindrome Permutation",         "difficulty": "easy",   "topics": ["string", "hash map", "bit manipulation"], "description": "Determine if a permutation of the string could form a palindrome."},
    ],

    "amazon": [
        {"title": "Two Sum",                        "difficulty": "easy",   "topics": ["array", "hash map"],                    "description": "Find two numbers that add up to target."},
        {"title": "Number of Islands",              "difficulty": "medium", "topics": ["DFS", "BFS", "union find", "grid"],     "description": "Count the number of islands in a 2D grid."},
        {"title": "Reorder Log Files",              "difficulty": "easy",   "topics": ["string", "sorting"],                    "description": "Reorder log files: letter-logs before digit-logs, sorted."},
        {"title": "K Closest Points to Origin",    "difficulty": "medium", "topics": ["heap", "sorting", "geometry"],           "description": "Find the k closest points to the origin."},
        {"title": "Find All Anagrams in a String",  "difficulty": "medium", "topics": ["sliding window", "hash map"],           "description": "Find all start indices of anagram substrings."},
        {"title": "Copy List with Random Pointer",  "difficulty": "medium", "topics": ["linked list", "hash map"],               "description": "Deep copy a linked list that has an additional random pointer."},
        {"title": "Robot Bounded in Circle",        "difficulty": "medium", "topics": ["math", "simulation"],                   "description": "Determine if a robot following instructions stays in a circle."},
        {"title": "Sliding Window Maximum",         "difficulty": "hard",   "topics": ["deque", "sliding window"],              "description": "Find the maximum in every sliding window of size k."},
        {"title": "Word Search",                    "difficulty": "medium", "topics": ["DFS", "backtracking", "grid"],          "description": "Determine if a word exists in a 2D grid of letters."},
    ],

    "microsoft": [
        {"title": "LRU Cache",                      "difficulty": "medium", "topics": ["design", "hash map", "doubly linked list"], "description": "Implement an LRU cache with O(1) get and put."},
        {"title": "Valid Parentheses",              "difficulty": "easy",   "topics": ["stack", "string"],                      "description": "Determine if a string of brackets is valid."},
        {"title": "Reverse Words in a String",      "difficulty": "medium", "topics": ["string", "two pointer"],                "description": "Reverse the order of words in a string."},
        {"title": "Spiral Matrix",                  "difficulty": "medium", "topics": ["array", "simulation"],                  "description": "Return all elements of a matrix in spiral order."},
        {"title": "Maximum Depth of Binary Tree",   "difficulty": "easy",   "topics": ["tree", "DFS", "recursion"],             "description": "Find the maximum depth of a binary tree."},
        {"title": "Lowest Common Ancestor of BST",  "difficulty": "medium", "topics": ["tree", "DFS"],                         "description": "Find the lowest common ancestor in a BST."},
        {"title": "Linked List Cycle",              "difficulty": "easy",   "topics": ["linked list", "two pointer"],           "description": "Detect if a linked list has a cycle."},
    ],

    "apple": [
        {"title": "Find the Duplicate Number",      "difficulty": "medium", "topics": ["array", "two pointer", "binary search"], "description": "Find the duplicate number in an array without modifying it."},
        {"title": "Design a Hit Counter",           "difficulty": "medium", "topics": ["design", "queue"],                     "description": "Design a hit counter which counts requests in past 5 minutes."},
        {"title": "Maximum Subarray",               "difficulty": "easy",   "topics": ["dynamic programming", "array"],        "description": "Find the contiguous subarray with the largest sum (Kadane's)."},
        {"title": "3Sum",                           "difficulty": "medium", "topics": ["array", "two pointer", "sorting"],     "description": "Find all unique triplets that sum to zero."},
        {"title": "String Compression",             "difficulty": "medium", "topics": ["string", "two pointer"],               "description": "Compress a string in-place using counts of repeated characters."},
    ],

    "netflix": [
        {"title": "Longest Substring Without Repeating Characters", "difficulty": "medium", "topics": ["sliding window", "hash map"], "description": "Find the length of the longest substring without repeating characters."},
        {"title": "Top K Frequent Elements",        "difficulty": "medium", "topics": ["heap", "hash map", "bucket sort"],     "description": "Return the k most frequent elements."},
        {"title": "Design Twitter",                 "difficulty": "medium", "topics": ["design", "heap", "hash map"],          "description": "Design a simplified version of Twitter's news feed."},
        {"title": "Merge K Sorted Lists",           "difficulty": "hard",   "topics": ["heap", "linked list", "divide and conquer"], "description": "Merge k sorted linked lists into one sorted list."},
    ],

    "uber": [
        {"title": "Surge Pricing (Rate Limiter)",   "difficulty": "medium", "topics": ["design", "sliding window", "queue"],   "description": "Design a rate limiter that allows k requests per time window."},
        {"title": "Number of Connected Components", "difficulty": "medium", "topics": ["union find", "DFS", "graph"],          "description": "Find number of connected components in an undirected graph."},
        {"title": "Minimum Cost to Connect All Points", "difficulty": "medium", "topics": ["minimum spanning tree", "greedy"], "description": "Find MST cost to connect all points on a 2D plane."},
        {"title": "Valid Sudoku",                   "difficulty": "medium", "topics": ["array", "hash map"],                   "description": "Determine if a 9x9 Sudoku board is valid."},
        {"title": "Implement Trie (Prefix Tree)",   "difficulty": "medium", "topics": ["trie", "design", "string"],            "description": "Implement a trie with insert, search, and startsWith."},
    ],

    "stripe": [
        {"title": "Longest Common Prefix",          "difficulty": "easy",   "topics": ["string", "sorting"],                   "description": "Find the longest common prefix among an array of strings."},
        {"title": "Valid Anagram",                  "difficulty": "easy",   "topics": ["string", "sorting", "hash map"],       "description": "Determine if two strings are anagrams."},
        {"title": "Group Anagrams",                 "difficulty": "medium", "topics": ["string", "hash map", "sorting"],       "description": "Group strings that are anagrams of each other."},
        {"title": "Decode Ways",                    "difficulty": "medium", "topics": ["dynamic programming", "string"],       "description": "Count the number of ways to decode a digit string to letters."},
        {"title": "Merge Intervals",                "difficulty": "medium", "topics": ["array", "interval", "sorting"],        "description": "Merge all overlapping intervals."},
    ],

    "airbnb": [
        {"title": "Nested List Weight Sum",         "difficulty": "medium", "topics": ["DFS", "recursion", "design"],          "description": "Return weighted sum of all integers in nested list."},
        {"title": "Find All Duplicates in an Array","difficulty": "medium", "topics": ["array", "hash map"],                   "description": "Find all elements that appear twice in an array."},
        {"title": "Meeting Scheduler",              "difficulty": "medium", "topics": ["interval", "two pointer", "sorting"],  "description": "Find the earliest time slot for a meeting given two people's schedules."},
        {"title": "Collatz Conjecture",             "difficulty": "easy",   "topics": ["math", "simulation"],                  "description": "Simulate the Collatz sequence and count steps to reach 1."},
    ],

    "linkedin": [
        {"title": "Maximum Product Subarray",       "difficulty": "medium", "topics": ["dynamic programming", "array"],        "description": "Find the contiguous subarray with the largest product."},
        {"title": "Find First and Last Position",   "difficulty": "medium", "topics": ["binary search", "array"],              "description": "Find first and last positions of a target in a sorted array."},
        {"title": "Isomorphic Strings",             "difficulty": "easy",   "topics": ["string", "hash map"],                  "description": "Determine if two strings are isomorphic."},
        {"title": "Count Primes",                   "difficulty": "medium", "topics": ["math", "Sieve of Eratosthenes"],       "description": "Count the number of primes less than n."},
    ],

    # ── Indian Tech / Startups ────────────────────────────────────────────────

    "flipkart": [
        {"title": "Flatten Nested List Iterator",   "difficulty": "medium", "topics": ["design", "iterator", "stack"],         "description": "Design an iterator to flatten a nested list."},
        {"title": "Maximum Profit in Stock Trading","difficulty": "easy",   "topics": ["array", "greedy"],                     "description": "Find the maximum profit from buying and selling a stock once."},
        {"title": "Next Greater Element",           "difficulty": "easy",   "topics": ["stack", "monotonic stack"],            "description": "Find the next greater element for each element in an array."},
        {"title": "Check if Array is Sorted and Rotated", "difficulty": "easy", "topics": ["array"],                          "description": "Check if an array is a rotation of a sorted array."},
    ],

    "swiggy": [
        {"title": "Design Order Management System", "difficulty": "medium", "topics": ["design", "queue", "hash map"],         "description": "Design a food delivery order management system."},
        {"title": "Distance to Nearest 0 in Grid",  "difficulty": "medium", "topics": ["BFS", "dynamic programming", "grid"], "description": "Find distance of the nearest 0 for each cell in a matrix."},
        {"title": "Minimum Path Sum",               "difficulty": "medium", "topics": ["dynamic programming", "grid"],        "description": "Find a path from top-left to bottom-right with minimum sum."},
    ],

    "zomato": [
        {"title": "Restaurant Rating Filter",       "difficulty": "easy",   "topics": ["array", "sorting", "filter"],          "description": "Filter and rank restaurants by rating, cost, and cuisine type."},
        {"title": "K Closest Restaurants",          "difficulty": "medium", "topics": ["heap", "sorting", "geometry"],         "description": "Find k closest restaurants to a user's location."},
        {"title": "Count Pairs with Given Sum",     "difficulty": "easy",   "topics": ["hash map", "array"],                   "description": "Count pairs in an array whose sum equals a target."},
    ],

    "ola": [
        {"title": "Shortest Path in Graph",         "difficulty": "medium", "topics": ["Dijkstra", "graph", "BFS"],            "description": "Find the shortest path between two nodes in a weighted graph."},
        {"title": "Ride Matching (Bipartite Graph)","difficulty": "medium", "topics": ["graph", "bipartite matching"],         "description": "Match drivers to riders optimally using graph matching."},
    ],

    # ── Finance / Fintech ─────────────────────────────────────────────────────

    "goldman sachs": [
        {"title": "Stock Price Span",               "difficulty": "medium", "topics": ["stack", "monotonic stack"],            "description": "Find the span of stock prices for each day."},
        {"title": "Best Time to Buy and Sell Stock III", "difficulty": "hard", "topics": ["dynamic programming"],             "description": "Max profit with at most two transactions."},
        {"title": "Count of Smaller Numbers After Self", "difficulty": "hard", "topics": ["merge sort", "BIT", "binary search"], "description": "Count elements to the right smaller than each element."},
        {"title": "Climbing Stairs",                "difficulty": "easy",   "topics": ["dynamic programming", "math"],        "description": "Count distinct ways to climb n stairs taking 1 or 2 steps."},
    ],

    "morgan stanley": [
        {"title": "Maximum Sum Circular Subarray",  "difficulty": "medium", "topics": ["dynamic programming", "Kadane"],      "description": "Find the max sum of a circular subarray."},
        {"title": "Coin Change",                    "difficulty": "medium", "topics": ["dynamic programming", "BFS"],         "description": "Find minimum coins needed to make up amount."},
        {"title": "Fibonacci Number",               "difficulty": "easy",   "topics": ["recursion", "dynamic programming", "math"], "description": "Compute the nth Fibonacci number efficiently."},
    ],

    "jpmorgan": [
        {"title": "Integer to Roman",               "difficulty": "medium", "topics": ["string", "math", "greedy"],           "description": "Convert an integer to a Roman numeral."},
        {"title": "Palindrome Number",              "difficulty": "easy",   "topics": ["math"],                               "description": "Determine if an integer is a palindrome without converting to string."},
        {"title": "First Missing Positive",         "difficulty": "hard",   "topics": ["array", "math"],                      "description": "Find the smallest missing positive integer in O(n) time."},
    ],

    # ── Other Major Players ───────────────────────────────────────────────────

    "atlassian": [
        {"title": "Design In-Memory File System",   "difficulty": "hard",   "topics": ["design", "trie", "hash map"],         "description": "Design a file system with mkdir, addContentToFile, readContentFromFile."},
        {"title": "Course Schedule",                "difficulty": "medium", "topics": ["topological sort", "DFS", "graph"],   "description": "Determine if you can finish all courses given prerequisites."},
        {"title": "Clone Graph",                    "difficulty": "medium", "topics": ["DFS", "BFS", "hash map", "graph"],    "description": "Return a deep copy of a connected undirected graph."},
    ],

    "salesforce": [
        {"title": "Design HashMap",                 "difficulty": "easy",   "topics": ["design", "hash map", "array"],        "description": "Implement HashMap without built-in hash table libraries."},
        {"title": "Product of Array Except Self",   "difficulty": "medium", "topics": ["array", "prefix sum"],                "description": "Return array where each element is product of all other elements."},
        {"title": "Rotate Array",                   "difficulty": "medium", "topics": ["array", "two pointer"],               "description": "Rotate an array to the right by k steps in O(1) space."},
    ],

    "oracle": [
        {"title": "Find Median from Data Stream",   "difficulty": "hard",   "topics": ["heap", "design"],                     "description": "Design a data structure to find the median of a stream."},
        {"title": "Implement Queue using Stacks",   "difficulty": "easy",   "topics": ["stack", "design", "queue"],           "description": "Implement a FIFO queue using only two stacks."},
        {"title": "Balanced Binary Tree",           "difficulty": "easy",   "topics": ["tree", "DFS", "recursion"],           "description": "Determine if a binary tree is height-balanced."},
    ],

    "adobe": [
        {"title": "Remove Duplicates from Sorted Array", "difficulty": "easy", "topics": ["array", "two pointer"],           "description": "Remove duplicates in-place and return new length."},
        {"title": "Longest Palindromic Substring",  "difficulty": "medium", "topics": ["dynamic programming", "string", "expand around center"], "description": "Find the longest palindromic substring."},
        {"title": "Pacific Atlantic Water Flow",    "difficulty": "medium", "topics": ["DFS", "BFS", "grid"],                "description": "Find cells where water can flow to both oceans."},
    ],

    "paypal": [
        {"title": "Detect Capital",                 "difficulty": "easy",   "topics": ["string"],                             "description": "Verify if capital usage in a word is correct."},
        {"title": "Decode String",                  "difficulty": "medium", "topics": ["stack", "string", "recursion"],       "description": "Decode an encoded string like '3[a2[c]]' → 'accaccacc'."},
        {"title": "Integer to English Words",       "difficulty": "hard",   "topics": ["string", "math", "recursion"],        "description": "Convert a non-negative integer to its English words representation."},
    ],

    "razorpay": [
        {"title": "Implement Trie",                 "difficulty": "medium", "topics": ["trie", "design", "string"],           "description": "Implement a trie with insert, search, and startsWith."},
        {"title": "Design URL Shortener",           "difficulty": "medium", "topics": ["design", "hash map", "encoding"],     "description": "Design a URL shortening service like bit.ly."},
        {"title": "Count Occurrences of Anagrams",  "difficulty": "medium", "topics": ["sliding window", "hash map"],         "description": "Count occurrences of anagrams of a pattern in a text."},
    ],

    "thoughtworks": [
        {"title": "Find All Paths in DAG",          "difficulty": "medium", "topics": ["DFS", "backtracking", "graph"],       "description": "Find all paths from source to target in a directed acyclic graph."},
        {"title": "Largest Rectangle in Histogram", "difficulty": "hard",   "topics": ["stack", "monotonic stack"],           "description": "Find the largest rectangle area in a histogram."},
        {"title": "Word Break",                     "difficulty": "medium", "topics": ["dynamic programming", "BFS", "trie"],"description": "Determine if s can be segmented into words from the dictionary."},
    ],

    "tcs": [
        {"title": "Reverse a String",               "difficulty": "easy",   "topics": ["string", "two pointer"],               "description": "Reverse a string in-place."},
        {"title": "Count Characters in a String",   "difficulty": "easy",   "topics": ["string", "hash map"],                  "description": "Count frequency of each character in a string."},
        {"title": "Find Second Largest",            "difficulty": "easy",   "topics": ["array", "sorting"],                    "description": "Find the second largest element in an array."},
        {"title": "Check Prime Number",             "difficulty": "easy",   "topics": ["math"],                                "description": "Determine if a number is prime."},
        {"title": "Fibonacci Sequence",             "difficulty": "easy",   "topics": ["recursion", "dynamic programming"],    "description": "Generate first n numbers of the Fibonacci sequence."},
    ],

    "infosys": [
        {"title": "Anagram Check",                  "difficulty": "easy",   "topics": ["string", "sorting", "hash map"],       "description": "Check if two strings are anagrams of each other."},
        {"title": "Matrix Rotation",                "difficulty": "medium", "topics": ["array", "math"],                       "description": "Rotate an NxN matrix 90 degrees clockwise in-place."},
        {"title": "Longest Increasing Subsequence", "difficulty": "medium", "topics": ["dynamic programming", "binary search"],"description": "Find the length of the longest increasing subsequence."},
    ],

    "wipro": [
        {"title": "Binary Search",                  "difficulty": "easy",   "topics": ["binary search", "array"],              "description": "Search a target in a sorted array in O(log n)."},
        {"title": "Bubble Sort",                    "difficulty": "easy",   "topics": ["sorting", "array"],                    "description": "Implement bubble sort and count the number of swaps."},
        {"title": "Find Missing Number",            "difficulty": "easy",   "topics": ["array", "math", "XOR"],                "description": "Find the missing number in an array containing 1 to n."},
    ],
}


def get_company_problems(company_name: str) -> list[dict]:
    """
    Return curated problem list for a company (case-insensitive).
    Returns empty list if company not in bank.
    """
    key = company_name.lower().strip()
    # Exact match
    if key in COMPANY_PROBLEM_BANK:
        return COMPANY_PROBLEM_BANK[key]
    # Fuzzy: check if company name appears in any key
    for bank_key, problems in COMPANY_PROBLEM_BANK.items():
        if bank_key in key or key in bank_key:
            return problems
    return []


def get_company_problems_by_difficulty(company_name: str, difficulty: str) -> list[dict]:
    """Filter company problems by difficulty."""
    problems = get_company_problems(company_name)
    return [p for p in problems if p.get("difficulty") == difficulty.lower()]
